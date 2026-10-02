import { Module } from '@nestjs/common';
import { SuppressionsController } from './suppressions.controller';
import { SuppressionsService } from './suppressions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SuppressionsController],
  providers: [SuppressionsService],
  exports: [SuppressionsService],
})
export class SuppressionsModule {}
