import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  valueProps?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audienceHints?: string[];

  @IsOptional()
  @IsString()
  pricingNotes?: string;

  @IsOptional()
  @IsObject()
  qualificationRules?: Record<string, unknown>;
}
