import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.list(user.workspaceId, user.userId, user.role);
  }

  @Post(':id/complete')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.complete(user.workspaceId, id);
  }
}
