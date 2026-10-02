import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CampaignStatus } from '@prisma/client';

const CAMPAIGN_STATUSES = Object.values(CampaignStatus);

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  aiPrompt?: string;

  @IsOptional()
  @IsString()
  ai_prompt?: string;

  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  schedule?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  mailbox?: string;

  @IsOptional()
  @IsString()
  calendarLink?: string;

  @IsOptional()
  @IsArray()
  leadSources?: string[];

  @IsOptional()
  @IsObject()
  eligibility?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  sequence?: unknown[];

  @IsOptional()
  @IsBoolean()
  approvalMode?: boolean;

  @IsOptional()
  @IsIn(['draft', 'approval', 'autopilot'])
  launchMode?: 'draft' | 'approval' | 'autopilot';

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  offer?: string;

  @IsOptional()
  @IsString()
  pricing?: string;

  @IsOptional()
  @IsNumber()
  budget?: number;

  @IsOptional()
  @IsString()
  brandTone?: string;

  @IsOptional()
  @IsArray()
  documents?: string[];

  @IsOptional()
  @IsObject()
  channels?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ads?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  crmConnected?: boolean;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: CampaignStatus;
}
