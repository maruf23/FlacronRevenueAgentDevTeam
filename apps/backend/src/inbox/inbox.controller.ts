import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { InboxService } from './inbox.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { ReplyTransformAction } from '../providers/ai.provider';

const TRANSFORM_ACTIONS: ReplyTransformAction[] = [
  'shorten',
  'expand',
  'translate',
  'change_tone',
  'add_pricing',
  'add_calendar_link',
  'add_proposal',
  'regenerate',
  'custom',
];

class TransformReplyDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsIn(TRANSFORM_ACTIONS)
  action!: ReplyTransformAction;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  customInstruction?: string;
}

class SendReplyDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  scheduleAt?: string;
}

const REPLY_UI_ACTIONS = [
  'edit',
  'write_custom',
  'schedule_open',
  'tone_select',
  'translate_select',
] as const;

class ReplyActionDto {
  @IsIn(REPLY_UI_ACTIONS)
  action!: (typeof REPLY_UI_ACTIONS)[number];

  @IsOptional()
  @IsString()
  detail?: string;
}

@Controller('inbox')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.inboxService.listConversations(user.workspaceId);
  }

  /** Pull replies from Gmail IMAP (SMTP credentials) into Inbox. */
  @Post('sync')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.inboxService.syncMailbox(user.workspaceId);
  }

  /**
   * Unified thread with full sync history + AI insight panel fields.
   * Prefer this over GET :conversationId/messages for new clients.
   */
  @Get('messages')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  listMessages(
    @Query('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboxService.listMessages(user.workspaceId, {
      conversationId,
    });
  }

  @Get(':conversationId/messages')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  messages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboxService.getConversationMessages(
      user.workspaceId,
      conversationId,
    );
  }

  @Post(':conversationId/suggest-reply')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  suggestReply(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboxService.suggestReply(
      user.workspaceId,
      conversationId,
      user.userId,
    );
  }

  @Post(':conversationId/transform-reply')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  transformReply(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: TransformReplyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboxService.transformReply(
      user.workspaceId,
      conversationId,
      dto,
      user.userId,
    );
  }

  @Post(':conversationId/reply-action')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  logReplyAction(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: ReplyActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboxService.logReplyAction(
      user.workspaceId,
      conversationId,
      user.userId,
      dto,
    );
  }

  @Post(':conversationId/send')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  sendReply(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendReplyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboxService.sendReply(
      user.workspaceId,
      conversationId,
      dto,
      user.userId,
    );
  }
}