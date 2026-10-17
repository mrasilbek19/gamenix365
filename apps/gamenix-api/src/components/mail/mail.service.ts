import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import * as nodemailer from 'nodemailer';
import { emailVerificationMessage, orderEmailMessage, passwordResetMessage } from './mail.templates';
import { OrderEmailSnapshot } from '../../libs/dto/mail/email-delivery';
import { EmailDeliveryTemplate } from '../../libs/enums/email-delivery.enum';

interface MailMessage {
    to: string;
    subject: string;
    html: string;
    text: string;
    messageId?: string;
}

@Injectable()
export class MailService implements OnModuleDestroy {
    private readonly logger = new Logger(MailService.name);
    private readonly transporter: nodemailer.Transporter;
    private readonly from: string;
    private readonly capture: boolean;
    private capturedMessages: MailMessage[] = [];

    constructor(config: ConfigService) {
        const environment = config.get<string>('NODE_ENV');
        const mode = config.get<string>('MAIL_TRANSPORT') ?? (environment === 'production' ? 'smtp' : 'capture');
        if (!['smtp', 'capture'].includes(mode) || (environment === 'production' && mode === 'capture') ||
            (environment === 'test' && mode !== 'capture')) {
            throw new Error('Invalid MAIL_TRANSPORT for this environment');
        }
        this.capture = mode === 'capture';
        this.from = config.get<string>('MAIL_FROM') ?? (this.capture ? 'no-reply@gamenix365.test' : '');
        if (!isEmail(this.from)) throw new Error('MAIL_FROM must be a valid email address');
        if (this.capture) {
            this.transporter = nodemailer.createTransport({ jsonTransport: true, disableFileAccess: true, disableUrlAccess: true });
        } else {
            const host = config.get<string>('SMTP_HOST');
            const port = Number(config.get<string>('SMTP_PORT') ?? 587);
            const user = config.get<string>('SMTP_USER');
            const pass = config.get<string>('SMTP_PASS');
            if (!host || !/^[a-z0-9.-]+$/i.test(host) || host.length > 253 || !Number.isInteger(port) ||
                port < 1 || port > 65535 || !user?.trim() || !pass?.trim()) {
                throw new Error('Invalid SMTP configuration: SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS are required');
            }
            this.transporter = nodemailer.createTransport({
                host, port, secure: port === 465, requireTLS: port !== 465,
                auth: { user, pass }, tls: { rejectUnauthorized: true },
                connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
                logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
            });
        }
    }

    public async sendMail(message: MailMessage): Promise<void> {
        if (!isEmail(message.to)) throw new ServiceUnavailableException('Email delivery is temporarily unavailable');
        try {
            await this.transporter.sendMail({ ...message, from: this.from });
            if (this.capture) {
                this.capturedMessages.push({ ...message });
                if (this.capturedMessages.length > 20) this.capturedMessages.shift();
            }
        } catch {
            // Provider errors can contain credentials, recipient addresses or message content.
            this.logger.error('Email delivery failed');
            throw new ServiceUnavailableException('Email delivery is temporarily unavailable');
        }
    }

    public async sendEmailVerification(to: string, name: string, link: string): Promise<void> {
        await this.sendMail({ to, ...emailVerificationMessage(name, link) });
    }

    public async sendPasswordResetCode(to: string, memberNick: string, code: string, minutes: number): Promise<void> {
        await this.sendMail({ to, ...passwordResetMessage(memberNick, code, minutes) });
    }

    public async sendOrderEmail(to: string, template: EmailDeliveryTemplate, order: OrderEmailSnapshot, deliveryId: string): Promise<void> {
        await this.sendMail({
            to,
            ...orderEmailMessage(template, order),
            messageId: `<gamenix-order-${deliveryId}@${this.from.split('@')[1]}>`,
        });
    }

    // Development/test inspection only. Never exposed through GraphQL or application logs.
    public getCapturedMessages(): MailMessage[] {
        return this.capturedMessages.map((message) => ({ ...message }));
    }

    public onModuleDestroy(): void {
        this.transporter.close();
        this.capturedMessages = [];
    }
}
