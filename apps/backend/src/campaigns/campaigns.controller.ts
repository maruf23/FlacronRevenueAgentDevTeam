import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { IsArray, IsIn, IsOptional } from 'class-validator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { AssignCampaignLeadsDto } from './dto/assign-campaign-leads.dto';
import {
  GenerateCampaignAdsDto,
  GenerateCampaignDetailsDto,
  GenerateCampaignSequenceDto,
} from './dto/generate-campaign-ai.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

class UpdateFutureStepsDto {
  @IsArray()
  sequence!: unknown[];
}

class ExportQueryDto {
  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';
}

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.create(user.workspaceId, dto);
  }

  @Post('ai/generate-details')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  generateDetails(
    @Body() dto: GenerateCampaignDetailsDto,
    @CurrentUser() _user: AuthenticatedUser,
  ) {
    return this.campaignsService.generateDetailsWithAi(dto);
  }

  @Post('ai/generate-sequence')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  generateSequence(
    @Body() dto: GenerateCampaignSequenceDto,
    @CurrentUser() _user: AuthenticatedUser,
  ) {
    return this.campaignsService.generateSequenceWithAi(dto);
  }

  @Post('ai/generate-ads')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  generateAds(
    @Body() dto: GenerateCampaignAdsDto,
    @CurrentUser() _user: AuthenticatedUser,
  ) {
    return this.campaignsService.generateAdsWithAi(dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.list(user.workspaceId);
  }

  @Get(':id/stats')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.getStats(user.workspaceId, id);
  }

  @Get(':id/workflow')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  getWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.getWorkflow(user.workspaceId, id);
  }

  @Get(':id/leads')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  listLeads(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.listCampaignLeads(user.workspaceId, id);
  }

  @Get(':id/eligibility')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  getEligibility(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.getEligibility(user.workspaceId, id);
  }

  @Get(':id/eligibility-summary')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  getEligibilitySummary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.getEligibilitySummary(user.workspaceId, id);
  }

  @Get(':id/preview-emails')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  previewEmails(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.previewPersonalizedEmails(
      user.workspaceId,
      id,
    );
  }

  @Post(':id/preview-emails/regenerate-all')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  regenerateAllPreviewEmails(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.regenerateAllPreviewEmails(
      user.workspaceId,
      id,
    );
  }

  @Post(':id/preview-emails/:leadId/regenerate')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  regeneratePreviewEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.regeneratePreviewEmail(
      user.workspaceId,
      id,
      leadId,
    );
  }

  @Patch(':id/preview-emails/:leadId')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  updatePreviewEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() body: { subject?: string; body?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.updatePreviewEmail(
      user.workspaceId,
      id,
      leadId,
      body,
    );
  }

  @Post(':id/preview-emails/:leadId/lock')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  lockPreviewEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() body: { locked?: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.lockPreviewEmail(
      user.workspaceId,
      id,
      leadId,
      body?.locked !== false,
    );
  }

  @Get(':id/launch-readiness')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  launchReadiness(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.getLaunchReadiness(user.workspaceId, id);
  }

  @Get(':id/launch-blockers')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  launchBlockers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.getLaunchBlockers(user.workspaceId, id);
  }

  @Get(':id/export')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.campaignsService.exportCampaign(
      user.workspaceId,
      id,
      query.format ?? 'csv',
    );
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.body);
  }

  @Post(':campaignId/leads')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  assignLeads(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: AssignCampaignLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.assignLeads(
      user.workspaceId,
      campaignId,
      dto.leadIds,
    );
  }

  @Post(':id/pause')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.pause(user.workspaceId, id);
  }

  @Post(':id/resume')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.resume(user.workspaceId, id);
  }

  @Post(':id/run')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  run(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.run(user.workspaceId, id);
  }

  @Post(':id/stop')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  stop(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.stop(user.workspaceId, id);
  }

  @Post(':id/archive')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.archive(user.workspaceId, id);
  }

  @Post(':id/duplicate')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.duplicate(user.workspaceId, id);
  }

  @Post(':id/remove-unsent-leads')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  removeUnsentLeads(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.removeUnsentLeads(user.workspaceId, id);
  }

  @Patch(':id/future-steps')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  updateFutureSteps(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFutureStepsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.updateFutureSteps(
      user.workspaceId,
      id,
      dto.sequence,
    );
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.findOne(user.workspaceId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.update(user.workspaceId, id, dto);
  }
}
