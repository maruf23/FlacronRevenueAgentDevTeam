import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/** Skip AuditInterceptor for public or noisy endpoints (login/register, health, webhooks). */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
