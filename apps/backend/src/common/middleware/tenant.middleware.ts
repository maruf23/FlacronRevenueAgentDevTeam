/**
 * Skeleton middleware for header-based tenant hints.
 * Prefer JWT `workspaceId` + RlsInterceptor for production tenancy.
 * Kept for optional header injection during local debugging.
 */
import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const header = this.config.get<string>('TENANT_HEADER', 'x-tenant-id');
    const tenantId = req.headers[header] as string | undefined;

    if (!tenantId) {
      next();
      return;
    }

    if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('Invalid tenant identifier');
    }

    (req as Request & { workspaceId?: string }).workspaceId = tenantId;
    next();
  }
}
