import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsNotEmpty, Max, IsOptional, IsDate, Length, Min } from 'class-validator';
import { ProductStatus, ProductType } from '../../enums/product.enum';
import { ObjectId } from 'mongoose';

@InputType()
export class ProductUpdate {
    @IsNotEmpty()
    @Field(() => String)
    _id: ObjectId;

    @IsOptional()
    @IsEnum(ProductType)
    @Field(() => ProductType, { nullable: true })
    productType?: ProductType;

    @IsOptional()
    @IsEnum(ProductStatus)
    @Field(() => ProductStatus, { nullable: true })
    productStatus?: ProductStatus;

    @IsOptional()
    @Length(3, 100)
    @Field(() => String, { nullable: true })
    productName?: string;

    @IsOptional()
    @IsInt()
    @Max(Number.MAX_SAFE_INTEGER)
    @Min(0)
    @Field(() => Number, { nullable: true })
    productPrice?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Field(() => Int, { nullable: true })
    productLeftCount?: number;

    @IsOptional()
    @Field(() => [String], { nullable: true })
    productImages?: string[];

    @IsOptional()
    @Length(5, 500)
    @Field(() => String, { nullable: true })
    productDesc?: string;

    soldAt?: Date;

    @IsOptional()
    @IsDate()
    @Field(() => Date, { nullable: true })
    deletedAt?: Date;
}
