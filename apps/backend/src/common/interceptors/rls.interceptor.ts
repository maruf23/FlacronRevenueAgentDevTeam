import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/types/jwt-payload.type';

/**
 * Sets PostgreSQL `app.current_workspace_id` on the pooled connection
 * before the request handler runs, activating RLS policies.
 *
 * Must run after JwtAuthGuard / TenancyGuard so `req.user.workspaceId` exists.
 * Clears the setting when there is no tenant context (public routes).
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      workspaceId?: string;
    }>();

    const workspaceId = request.user?.workspaceId ?? request.workspaceId ?? null;

    return from(this.prisma.setWorkspaceContext(workspaceId)).pipe(
      switchMap(() => next.handle()),
    );
  }
}
