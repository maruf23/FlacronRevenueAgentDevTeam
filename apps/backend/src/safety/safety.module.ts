import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SequencesModule } from '../sequences/sequences.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspacePauseService } from './workspace-pause.service';
import { EmergencyStopController } from '../emergency-stop/emergency-stop.controller';
import { AlertsController } from '../alerts/alerts.controller';

@Module({
  imports: [ScheduleModule.forRoot(), SequencesModule, AuditModule],
  controllers: [EmergencyStopController, AlertsController],
  providers: [WorkspacePauseService],
  exports: [WorkspacePauseService],
})
export class SafetyModule {}
