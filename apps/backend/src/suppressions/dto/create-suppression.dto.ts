import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { SuppressionReason } from '@prisma/client';

export class CreateSuppressionDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(SuppressionReason)
  reason?: SuppressionReason;

  @IsOptional()
  @IsString()
  source?: string;
}
