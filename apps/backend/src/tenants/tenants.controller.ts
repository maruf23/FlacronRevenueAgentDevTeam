import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';
import { TenantsService } from './tenants.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

class OnboardingProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

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
}

class UpdateOnboardingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  companyName?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  companySummary?: string;

  @IsOptional()
  @IsString()
  icpSummary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsString()
  geography?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OnboardingProductDto)
  product?: OnboardingProductDto;

  @IsOptional()
  @IsBoolean()
  skipMailbox?: boolean;

  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  list() {
    return this.tenantsService.findAll();
  }

  @Get('current')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.getCurrent(user.workspaceId);
  }

  @Patch('current/onboarding')
  @Roles(Role.OWNER, Role.ADMIN)
  updateOnboarding(
    @Body() dto: UpdateOnboardingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tenantsService.updateOnboarding(user.workspaceId, dto);
  }
}
