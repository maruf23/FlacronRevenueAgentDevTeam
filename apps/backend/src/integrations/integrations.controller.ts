import {
  Controller,
  Get,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService,
  ) {}

  @Get('email-status')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  emailStatus(@CurrentUser() _user: AuthenticatedUser) {
    const user = this.config.get<string>('SMTP_USER')?.trim() || '';
    const pass = this.config.get<string>('SMTP_PASS')?.trim() || '';
    const configured =
      Boolean(user) &&
      Boolean(pass) &&
      !pass.startsWith('your-') &&
      !user.startsWith('your-');

    return {
      smtpConfigured: configured,
      smtpHost: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      smtpUser: configured ? user : null,
      smtpFrom:
        this.config.get<string>('SMTP_FROM')?.trim() ||
        (configured ? user : null),
      oauthRequired: !configured,
      hint: configured
        ? 'SMTP app-password is ready. Approve Draft will send via Gmail SMTP.'
        : 'Set SMTP_USER and SMTP_PASS (Gmail App Password) in apps/backend/.env, then restart the backend.',
    };
  }

  /** Connection status for Integrations UI cards. */
  @Get('status')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.getConnectionStatus(user.workspaceId);
  }

  @Post('gmail/connect')
  @Roles(Role.OWNER, Role.ADMIN)
  connectGmail(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.createConnectUrl('gmail', user);
  }

  @Post('microsoft/connect')
  @Roles(Role.OWNER, Role.ADMIN)
  connectMicrosoft(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.createConnectUrl('microsoft', user);
  }

  @Public()
  @Get('gmail/callback')
  async gmailCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.integrations.handleCallback(
      'gmail',
      code,
      state,
    );
    return res.redirect(redirectUrl);
  }

  @Public()
  @Get('microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.integrations.handleCallback(
      'microsoft',
      code,
      state,
    );
    return res.redirect(redirectUrl);
  }
}
