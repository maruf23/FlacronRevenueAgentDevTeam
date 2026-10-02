import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
} from '@nestjs/common';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { MessageStatus, Role } from '@prisma/client';
import { SequenceQueueService } from './sequence-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

class ScheduleMessageDto {
  @IsUUID()
  leadId!: string;

  @IsString()
  subject!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsUUID()
  draftId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequenceStep?: number;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly sequences: SequenceQueueService,
    private readonly prisma: PrismaService,
  ) {}

  /** Create a message and enqueue it on the Sequence queue. */
  @Post('schedule')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async schedule(
    @Body() dto: ScheduleMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!dto.subject.trim() || !dto.body.trim()) {
      throw new BadRequestException('subject and body are required');
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, workspaceId: user.workspaceId },
      select: { id: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead ${dto.leadId} not found`);
    }

    const message = await this.prisma.message.create({
      data: {
        leadId: dto.leadId,
        workspaceId: user.workspaceId,
        subject: dto.subject,
        body: dto.body,
        draftId: dto.draftId,
        sequenceStep: dto.sequenceStep ?? 1,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
        status: MessageStatus.DRAFT,
      },
    });

    return this.sequences.enqueueMessage(message.id, user.workspaceId);
  }
}
