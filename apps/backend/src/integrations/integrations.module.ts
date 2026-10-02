import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { GmailAdapter } from './adapters/gmail.adapter';
import { MicrosoftAdapter } from './adapters/microsoft.adapter';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';

@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    GmailAdapter,
    MicrosoftAdapter,
    TokenEncryptionService,
  ],
  exports: [
    IntegrationsService,
    GmailAdapter,
    MicrosoftAdapter,
    TokenEncryptionService,
  ],
})
export class IntegrationsModule {}
