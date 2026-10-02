import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { LeadsService } from './leads.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

class UpdateStageDto {
  @IsString()
  @MinLength(1)
  stage!: string;
}

class CreateLeadDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;
}

class UpdateLeadDto {
  @IsOptional()
  @IsUUID()
  campaignId?: string | null;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @IsString()
  industry?: string | null;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  leadScore?: number | null;

  @IsOptional()
  @IsString()
  nextRecommendedAction?: string | null;
}

class BulkLeadsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  leadIds!: string[];

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsString()
  stage?: string;
}

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.leadsService.findAll(user.workspaceId, status);
  }

  @Get('campaigns')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  listCampaigns(@CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.listCampaigns(user.workspaceId);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.create(user.workspaceId, dto);
  }

  @Post('bulk/delete')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  bulkDelete(
    @Body() dto: BulkLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.deleteMany(user.workspaceId, dto.leadIds);
  }

  @Post('bulk/verify')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async bulkVerify(
    @Body() dto: BulkLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const results = [];
    for (const id of dto.leadIds) {
      results.push(await this.leadsService.verifyEmail(user.workspaceId, id));
    }
    return { updated: results.length, leads: results };
  }

  @Post('bulk/enrich')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async bulkEnrich(
    @Body() dto: BulkLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const results = [];
    for (const id of dto.leadIds) {
      results.push(await this.leadsService.enrich(user.workspaceId, id));
    }
    return { updated: results.length, leads: results };
  }

  @Post('bulk/campaign')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async bulkCampaign(
    @Body() dto: BulkLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!dto.campaignId) {
      return { updated: 0, leads: [] };
    }
    const results = [];
    for (const id of dto.leadIds) {
      results.push(
        await this.leadsService.update(user.workspaceId, id, {
          campaignId: dto.campaignId,
        }),
      );
    }
    return { updated: results.length, leads: results };
  }

  @Post('bulk/stage')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async bulkStage(
    @Body() dto: BulkLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!dto.stage) {
      return { updated: 0, leads: [] };
    }
    const results = [];
    for (const id of dto.leadIds) {
      results.push(
        await this.leadsService.updateStage(user.workspaceId, id, dto.stage!),
      );
    }
    return { updated: results.length, leads: results };
  }

  @Post('bulk/score')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  bulkScore(
    @Body() dto: BulkLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.scoreLeadsBulk(user.workspaceId, dto.leadIds);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.findOne(user.workspaceId, id);
  }

  @Patch(':id/stage')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.updateStage(user.workspaceId, id, dto.stage);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.update(user.workspaceId, id, dto);
  }

  @Post(':id/verify')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.verifyEmail(user.workspaceId, id);
  }

  @Post(':id/enrich')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  enrich(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.enrich(user.workspaceId, id);
  }

  @Post(':id/score')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  score(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.scoreLead(user.workspaceId, id);
  }

  @Patch(':id/qualification')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  updateQualification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.updateQualification(
      user.workspaceId,
      id,
      body ?? {},
    );
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.delete(user.workspaceId, id);
  }
}
