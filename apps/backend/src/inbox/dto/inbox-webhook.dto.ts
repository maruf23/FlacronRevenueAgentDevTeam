import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class InboxWebhookDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsIn(['gmail', 'microsoft', 'normalized'])
  provider?: 'gmail' | 'microsoft' | 'normalized';

  @IsString()
  subject!: string;

  @IsString()
  from!: string;

  @IsString()
  to!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  /** Gmail threadId / Microsoft conversationId */
  @IsOptional()
  @IsString()
  threadId?: string;
}
