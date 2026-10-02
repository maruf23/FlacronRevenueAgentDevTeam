import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { SKIP_AUDIT_KEY } from '../common/decorators/skip-audit.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Core resources that must produce immutable audit rows */
const RESOURCE_MAP: Array<{ match: RegExp; targetType: string }> = [
  { match: /^\/api\/leads(?:\/|$)/i, targetType: 'LEAD' },
  { match: /^\/api\/campaigns(?:\/|$)/i, targetType: 'CAMPAIGN' },
  { match: /^\/api\/users(?:\/|$)/i, targetType: 'USER' },
  { match: /^\/api\/emergency-stop(?:\/|$)/i, targetType: 'WORKSPACE' },
  { match: /^\/api\/inbox(?:\/|$)/i, targetType: 'CONVERSATION' },
];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { user?: AuthenticatedUser; workspaceId?: string }
    >();
    const method = (request.method || 'GET').toUpperCase();
    if (!MUTATING.has(method)) {
      return next.handle();
    }

    const path = request.originalUrl?.split('?')[0] ?? request.url ?? '';
    const resource = RESOURCE_MAP.find((r) => r.match.test(path));
    if (!resource) {
      return next.handle();
    }

    const workspaceId = request.user?.workspaceId ?? request.workspaceId;
    if (!workspaceId) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          void this.persistAudit({
            request,
            method,
            path,
            targetType: resource.targetType,
            workspaceId,
            responseBody,
          });
        },
      }),
    );
  }

  private async persistAudit(args: {
    request: Request & { user?: AuthenticatedUser };
    method: string;
    path: string;
    targetType: string;
    workspaceId: string;
    responseBody: unknown;
  }) {
    try {
      const { request, method, path, targetType, workspaceId, responseBody } =
        args;
      const targetId = this.extractTargetId(path, responseBody);
      const ip =
        (request.headers['x-forwarded-for'] as string | undefined)?.split(
          ',',
        )[0]?.trim() ||
        request.ip ||
        null;

      await this.auditService.record({
        workspaceId,
        actorUserId: request.user?.userId ?? null,
        action: `${method} ${path}`,
        targetType,
        targetId,
        changes: {
          body: this.sanitizeBody(request.body),
          result: this.summarizeResult(responseBody),
        } as Prisma.InputJsonValue,
        ipAddress: ip,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write audit event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private extractTargetId(path: string, responseBody: unknown): string | null {
    const uuidMatch = path.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    if (uuidMatch) return uuidMatch[0];

    if (
      responseBody &&
      typeof responseBody === 'object' &&
      'id' in responseBody &&
      typeof (responseBody as { id: unknown }).id === 'string'
    ) {
      return (responseBody as { id: string }).id;
    }
    return null;
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body ?? null;
    const clone = { ...(body as Record<string, unknown>) };
    for (const key of Object.keys(clone)) {
      if (/password|token|secret|authorization/i.test(key)) {
        clone[key] = '[REDACTED]';
      }
    }
    return clone;
  }

  private summarizeResult(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body ?? null;
    if (Array.isArray(body)) return { count: body.length };
    const obj = body as Record<string, unknown>;
    const pick: Record<string, unknown> = {};
    for (const key of ['id', 'status', 'jobId', 'email']) {
      if (key in obj) pick[key] = obj[key];
    }
    return Object.keys(pick).length ? pick : { ok: true };
  }
}
