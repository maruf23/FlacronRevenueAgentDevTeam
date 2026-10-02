import { Module } from '@nestjs/common';
import { DeliverabilityController } from './deliverability.controller';
import { DeliverabilityService } from './deliverability.service';
import { DomainDnsService } from './domain-dns.service';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  controllers: [DeliverabilityController],
  providers: [DeliverabilityService, DomainDnsService],
  exports: [DeliverabilityService, DomainDnsService],
})
export class DeliverabilityModule {}
