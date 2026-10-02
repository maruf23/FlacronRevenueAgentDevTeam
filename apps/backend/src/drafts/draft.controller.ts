import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { DraftService } from './draft.service';
import { ApproveDraftDto } from './dto/approve-draft.dto';
import { GenerateDraftDto } from './dto/generate-draft.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

@Controller('drafts')
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  @Post('generate')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  generate(
    @Body() dto: GenerateDraftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftService.generate(dto, user.workspaceId);
  }

  @Patch(':draftId/approve')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  approve(
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() dto: ApproveDraftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftService.approve(draftId, user.workspaceId, dto ?? {});
  }

  @Patch(':draftId/reject')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  reject(
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.draftService.reject(draftId, user.workspaceId);
  }
}
