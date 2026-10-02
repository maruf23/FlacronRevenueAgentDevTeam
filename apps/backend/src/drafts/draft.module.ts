import { Module } from '@nestjs/common';
import { DraftController } from './draft.controller';
import { DraftService } from './draft.service';
import { AiModule } from '../ai/ai.module';
import { SequencesModule } from '../sequences/sequences.module';

@Module({
  imports: [AiModule, SequencesModule],
  controllers: [DraftController],
  providers: [DraftService],
  exports: [DraftService],
})
export class DraftModule {}
