import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger: Logger = new Logger();

    public intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<any> {
        const recordTime = Date.now();
        const requestType = context.getType<GqlContextType>();

        if (requestType === 'http') {
            return next.handle();
            // Develop if needed!
        } else if (requestType === 'graphql') {
            const gqlContext = GqlExecutionContext.create(context);
            const fieldName = gqlContext.getInfo()?.fieldName;
            const body = gqlContext.getContext().req.body;
            const paymentOperation = /\b(createTestCheckoutSession|getPaymentStatus|getTestCheckoutAvailability)\b/;
            const privateRequest = ['requestEmailVerification', 'verifyEmail', 'createTestCheckoutSession',
                'getPaymentStatus', 'getTestCheckoutAvailability'].includes(fieldName)
                || (Array.isArray(body) ? body : [body]).some((request) => paymentOperation.test(request?.query ?? ''));
            this.logger.log(privateRequest ? fieldName : `${this.stringify(gqlContext.getContext().req.body)}`, 'REQUEST');

            return next.handle().pipe(
                tap((context) => {
                    const responseTime = Date.now() - recordTime;
                    this.logger.log(`${privateRequest ? fieldName : this.stringify(context)} - ${responseTime}ms\n\n`, 'RESPONSE');
                }),
            );
        }
    }
    private stringify(context: ExecutionContext): string {
        return JSON.stringify(context).slice(0, 75)
    }
}
