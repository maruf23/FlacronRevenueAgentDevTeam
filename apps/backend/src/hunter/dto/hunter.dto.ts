import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HunterDomainSearchDto {
  @IsString()
  @MinLength(1)
  domain!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  seniority?: string;

  @IsOptional()
  @IsString()
  department?: string;
}

export class HunterEmailFinderDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(1)
  domain!: string;
}

export class HunterEmailVerifierDto {
  @IsEmail()
  email!: string;
}

export class HunterEnrichDto {
  @ValidateIf((o: HunterEnrichDto) => !o.url)
  @IsString()
  @MinLength(1)
  domain?: string;

  @ValidateIf((o: HunterEnrichDto) => !o.domain)
  @IsString()
  @MinLength(1)
  url?: string;
}

/** One contact from Hunter domain-search (`value` / `first_name` / …) or normalized fields. */
export class HunterImportContactDto {
  @ValidateIf((o: HunterImportContactDto) => !o.value)
  @IsEmail()
  email?: string;

  @ValidateIf((o: HunterImportContactDto) => !o.email)
  @IsEmail()
  value?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;
}

export class HunterConfirmImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HunterImportContactDto)
  contacts!: HunterImportContactDto[];

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  organization?: string;
}
