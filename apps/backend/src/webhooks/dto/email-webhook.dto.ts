import { IsEmail, IsIn, IsOptional, IsUUID, IsString } from 'class-validator';

export class EmailWebhookDto {
  @IsUUID()
  workspaceId!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsUUID()
  messageId?: string;

  /** Provider-native id (Gmail message id / Graph message id) */
  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @IsOptional()
  @IsIn(['GMAIL', 'MICROSOFT', 'SMTP'])
  provider?: 'GMAIL' | 'MICROSOFT' | 'SMTP';

  @IsOptional()
  @IsString()
  source?: string;

  /** hard | soft — bounce classification */
  @IsOptional()
  @IsIn(['hard', 'soft'])
  bounceType?: 'hard' | 'soft';

  @IsOptional()
  @IsString()
  complaintReason?: string;
}

/** Real-time delivery / send lifecycle from Gmail or Microsoft Graph */
export class EmailStatusWebhookDto {
  @IsUUID()
  workspaceId!: string;

  @IsIn(['SENDING', 'SENT', 'DELIVERED', 'FAILED'])
  status!: 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED';

  @IsOptional()
  @IsUUID()
  messageId?: string;

  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['GMAIL', 'MICROSOFT', 'SMTP'])
  provider?: 'GMAIL' | 'MICROSOFT' | 'SMTP';

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;
}
