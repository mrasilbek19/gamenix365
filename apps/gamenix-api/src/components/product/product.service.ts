import { assertKrwAmount } from '../../libs/money';
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Products, Product } from '../../libs/dto/product/product';
import { Direction, Message } from '../../libs/enums/common.enum';
import { ShopProductsInquiry, AllProductsInquiry, OrdinaryInquiry, ProductsInquiry, ProductInput } from '../../libs/dto/product/product.input';
import { MemberService } from '../member/member.service';
import { StatisticModifier, T } from '../../libs/types/common';
import { ProductStatus } from '../../libs/enums/product.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import { ProductUpdate } from '../../libs/dto/product/product.update';
import { lookupAuthMemberLiked, lookupMember, shapeIntoMongoObjectId } from '../../libs/config';
import { LikeService } from '../like/like.service';
import { LikeInput } from '../../libs/dto/like/like.input';
import { LikeGroup } from '../../libs/enums/like.enum';

@Injectable()
export class ProductService {
    constructor(
        @InjectModel('Product')
        private readonly productModel: Model<Product>,
        private memberService: MemberService,
        private viewService: ViewService,
        private likeService: LikeService,
    ) { }

    public async createProduct(input: ProductInput): Promise<Product> {
        await this.memberService.assertActiveShop(input.memberId);
        assertKrwAmount(input.productPrice);
        try {
            const result = await this.productModel.create({ ...input, currency: 'KRW' });
            await this.memberService.memberStatsEditor({
                _id: result.memberId,
                targetKey: 'memberProducts',
                modifier: 1,
            });
            return result;
        } catch (err) {
            console.log('Error, Service.model:', err.message);
            throw new BadRequestException(Message.CREATE_FAILED);
        }
    }

    public async getProduct(
        memberId: ObjectId,
        productId: ObjectId,
    ): Promise<Product> {
        const search: T = {
            _id: productId,
            productStatus: ProductStatus.PROCESS,
            deletedAt: null,
        };

        const targetProduct: Product = await this.productModel
            .findOne(search)
            .lean()
            .exec();

        if (!targetProduct) {
            throw new InternalServerErrorException(Message.NO_DATA_FOUND);
        }

        if (memberId) {
            const viewInput = {
                memberId: memberId,
                viewRefId: productId,
                viewGroup: ViewGroup.PRODUCT,
            };

            const newView = await this.viewService.recordView(viewInput);

            if (newView) {
                await this.productStatsEditor({
                    _id: productId,
                    targetKey: 'productViews',
                    modifier: 1,
                });

                targetProduct.productViews++;
            }
        }

        const likeInput = {
            memberId: memberId,
            likeRefId: productId,
            likeGroup: LikeGroup.PRODUCT,
        };

        targetProduct.meLiked = await this.likeService.checkLikeExistence(likeInput);

        targetProduct.memberData = await this.memberService.getMember(
            null,
            targetProduct.memberId,
        );

        return targetProduct;
    }

    public async productStatsEditor(
        input: StatisticModifier,
    ): Promise<Product> {
        const { _id, targetKey, modifier } = input;

        return await this.productModel
            .findByIdAndUpdate(
                _id,
                { $inc: { [targetKey]: modifier } },
                { new: true },
            )
            .exec();
    }

    public async updateProduct(
        memberId: ObjectId,
        input: ProductUpdate,
    ): Promise<Product> {
        await this.memberService.assertActiveShop(memberId);
        let { productStatus, soldAt, deletedAt } = input;

        const search: T = {
            _id: input._id,
            memberId: memberId,
            productStatus: { $in: [ProductStatus.PROCESS, ProductStatus.PAUSE] },
            deletedAt: null,
        };

        if (input.productPrice !== undefined) {
            assertKrwAmount(input.productPrice);
            // Legacy prices require a separately approved repricing migration.
            search.currency = 'KRW';
        }

        if (productStatus === ProductStatus.FINISHED) input.soldAt = soldAt = new Date();
        if (deletedAt) input.deletedAt = deletedAt = new Date();

        const result = await this.productModel
            .findOneAndUpdate(search, input, {
                new: true,
                runValidators: true,
            })
            .exec();

        if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

        if (soldAt || deletedAt) {
            await this.memberService.memberStatsEditor({
                _id: memberId,
                targetKey: 'memberProducts',
                modifier: -1,
            });
        }

        return result;
    }

    public async getProducts(
        memberId: ObjectId,
        input: ProductsInquiry,
    ): Promise<Products> {
        const match: T = {
            currency: 'KRW',
            productStatus: ProductStatus.PROCESS,
            deletedAt: null,
        };

        const sort: T = {
            [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC,
        };

        this.shapeMatchQuery(match, input);
        console.log('match:', match);

        const result = await this.productModel
            .aggregate([
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        list: [
                            { $skip: (input.page - 1) * input.limit },
                            { $limit: input.limit },
                            lookupAuthMemberLiked(memberId),
                            lookupMember,
                            { $unwind: '$memberData' },
                        ],
                        metaCounter: [{ $count: 'total' }],
                    },
                },
            ])
            .exec();

        if (!result.length) {
            throw new InternalServerErrorException(Message.NO_DATA_FOUND);
        }

        return result[0];
    }


    private shapeMatchQuery(match: T, input: ProductsInquiry): void {
        const {
            memberId,
            typeList,
            periodsRange,
            pricesRange,
            text,
        } = input.search;

        if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
        if (typeList && typeList.length) match.productType = { $in: typeList };

        if (pricesRange)
            match.productPrice = {
                $gte: pricesRange.start,
                $lte: pricesRange.end,
            };

        if (periodsRange)
            match.createdAt = {
                $gte: periodsRange.start,
                $lte: periodsRange.end,
            };

        if (text) match.productName = { $regex: new RegExp(text, 'i') };

    }

    public async getFavorites(
        memberId: ObjectId,
        input: OrdinaryInquiry,
    ): Promise<Products> {
        return await this.likeService.getFavoriteProducts(memberId, input);
    }

    public async getVisited(
        memberId: ObjectId,
        input: OrdinaryInquiry,
    ): Promise<Products> {
        return await this.viewService.getVisitedProducts(memberId, input);
    }

    public async getShopProducts(
        memberId: ObjectId,
        input: ShopProductsInquiry,
    ): Promise<Products> {
        await this.memberService.assertActiveShop(memberId);
        const { productStatus } = input.search;

        const match: T = {
            memberId: memberId,
            deletedAt: null,
        };

        if (productStatus) match.productStatus = productStatus;

        const sort: T = {
            [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC,
        };

        const result = await this.productModel
            .aggregate([
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        list: [
                            { $skip: (input.page - 1) * input.limit },
                            { $limit: input.limit },
                            lookupMember,
                            { $unwind: '$memberData' },
                        ],
                        metaCounter: [{ $count: 'total' }],
                    },
                },
            ])
            .exec();

        if (!result.length)
            throw new InternalServerErrorException(Message.NO_DATA_FOUND);

        return result[0];
    }

    public async likeTargetProduct(memberId: ObjectId, likeRefId: ObjectId): Promise<Product> {
        const target: Product = await this.productModel
            .findOne({ _id: likeRefId, productStatus: ProductStatus.PROCESS, deletedAt: null })
            .exec();
        if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

        const input: LikeInput = {
            memberId: memberId,
            likeRefId: likeRefId,
            likeGroup: LikeGroup.PRODUCT,
        };

        const modifier: number = await this.likeService.toggleLike(input);
        const result = await this.productStatsEditor({ _id: likeRefId, targetKey: 'productLikes', modifier: modifier });

        if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
        return result;
    }

    public async getAllProductsByAdmin(
        input: AllProductsInquiry,
    ): Promise<Products> {
        const { productStatus } = input.search;

        const match: T = {};
        const sort: T = {
            [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC,
        };

        if (productStatus) match.productStatus = productStatus;

        const result = await this.productModel
            .aggregate([
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        list: [
                            { $skip: (input.page - 1) * input.limit },
                            { $limit: input.limit },
                            lookupMember,
                            { $unwind: '$memberData' },
                        ],
                        metaCounter: [{ $count: 'total' }],
                    },
                },
            ])
            .exec();

        if (!result.length)
            throw new InternalServerErrorException(Message.NO_DATA_FOUND);

        return result[0];
    }

    public async updateProductByAdmin(
        input: ProductUpdate,
    ): Promise<Product> {
        let { productStatus, soldAt, deletedAt } = input;

        const search: T = {
            _id: input._id,
            productStatus: { $in: [ProductStatus.PROCESS, ProductStatus.PAUSE] },
            deletedAt: null,
        };

        if (input.productPrice !== undefined) {
            assertKrwAmount(input.productPrice);
            // Legacy prices require a separately approved repricing migration.
            search.currency = 'KRW';
        }

        if (productStatus === ProductStatus.FINISHED) input.soldAt = soldAt = new Date();
        if (deletedAt) input.deletedAt = deletedAt = new Date();

        const result = await this.productModel
            .findOneAndUpdate(search, input, {
                new: true,
                runValidators: true,
            })
            .exec();

        if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

        if (soldAt || deletedAt) {
            await this.memberService.memberStatsEditor({
                _id: result.memberId,
                targetKey: 'memberProducts',
                modifier: -1,
            });
        }

        return result;
    }

    public async removeProductByAdmin(productId: ObjectId): Promise<Product> {
        const search: T = { _id: productId, deletedAt: { $ne: null } };
        const result = await this.productModel.findOneAndDelete(search).exec();
        if (!result) throw new InternalServerErrorException(Message.REMOVE_FAILED);

        return result;
    }

}
