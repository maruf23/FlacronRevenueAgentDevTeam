import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../../auth/types/jwt-payload.type';

/**
 * Ensures the JWT carries both `sub` (userId) and `workspaceId`,
 * then exposes them on the request for RLS and downstream handlers.
 */
@Injectable()
export class TenancyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      workspaceId?: string;
      userId?: string;
    }>();

    const user = request.user;

    if (!user?.userId || !user?.workspaceId) {
      throw new UnauthorizedException(
        'Missing tenant context: JWT must include sub and workspaceId',
      );
    }

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(user.workspaceId) || !uuidRe.test(user.userId)) {
      throw new UnauthorizedException('Invalid tenant context in token');
    }

    request.workspaceId = user.workspaceId;
    request.userId = user.userId;
    return true;
  }
}
