import { Query, Resolver } from '@nestjs/graphql';
import { KakaoPayTestAvailability } from '../../libs/dto/payment/kakao-checkout';
import { PortoneService } from './portone.service';

@Resolver()
export class PaymentResolver {
	constructor(private readonly portoneService: PortoneService) {}

	@Query(() => KakaoPayTestAvailability)
	public getKakaoPayTestAvailability(): KakaoPayTestAvailability {
		return this.portoneService.getKakaoPayTestAvailability();
	}
}
