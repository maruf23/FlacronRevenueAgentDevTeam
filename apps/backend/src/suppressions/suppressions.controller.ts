import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { SuppressionsService } from './suppressions.service';
import { CreateSuppressionDto } from './dto/create-suppression.dto';

@Controller('suppressions')
export class SuppressionsController {
  constructor(private readonly suppressions: SuppressionsService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.suppressions.list(user.workspaceId);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  create(
    @Body() dto: CreateSuppressionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppressions.create(user.workspaceId, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppressions.remove(user.workspaceId, id);
  }
}
