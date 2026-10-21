import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class KakaoPayTestAvailability {
	@Field(() => Boolean)
	enabled: boolean;

	@Field(() => String)
	currency: string;

	@Field(() => String)
	requiredCurrency: string;

	@Field(() => [String])
	blockers: string[];
}
