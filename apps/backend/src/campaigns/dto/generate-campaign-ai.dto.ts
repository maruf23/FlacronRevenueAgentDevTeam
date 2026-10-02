import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GenerateCampaignDetailsDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productHint?: string;
}

export class GenerateCampaignSequenceDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  product?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  calendarLink?: string;
}

export class GenerateCampaignAdsDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  product?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  offer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  brandTone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @IsOptional()
  @IsNumber()
  dailyBudget?: number;

  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown>;
}

