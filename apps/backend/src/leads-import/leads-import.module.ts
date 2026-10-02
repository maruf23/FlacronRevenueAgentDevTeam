import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LeadsImportController } from './leads-import.controller';
import { LeadsImportService } from './leads-import.service';
import { LeadImportProcessor } from './processors/lead-import.processor';
import { MockVerificationProvider } from './verification/mock-verification.provider';
import { VERIFICATION_PROVIDER } from './verification/verification-provider.interface';
import { QUEUE_NAMES } from '../queues/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.LEAD_IMPORT }),
  ],
  controllers: [LeadsImportController],
  providers: [
    LeadsImportService,
    LeadImportProcessor,
    {
      provide: VERIFICATION_PROVIDER,
      useClass: MockVerificationProvider,
    },
  ],
  exports: [LeadsImportService, VERIFICATION_PROVIDER],
})
export class LeadsImportModule {}
