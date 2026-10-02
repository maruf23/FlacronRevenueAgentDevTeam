import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveDraftDto {
  /** Optional edited subject — falls back to the generated subject */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject?: string;

  /** Optional edited body — falls back to the generated body */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body?: string;
}
