import { Injectable, Logger } from '@nestjs/common';
import {
  ProviderVerificationStatus,
  VerificationProvider,
  VerificationResult,
} from './verification-provider.interface';

const STATUSES: ProviderVerificationStatus[] = [
  'verified',
  'catch_all',
  'invalid',
  'risky',
];

/**
 * Mock provider for local/dev — randomly returns a verification status.
 * Swap for a real provider (NeverBounce, ZeroBounce, etc.) later.
 */
@Injectable()
export class MockVerificationProvider implements VerificationProvider {
  private readonly logger = new Logger(MockVerificationProvider.name);

  async verify(email: string): Promise<VerificationResult> {
    // Tiny delay to simulate an external HTTP call
    await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 40));

    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)]!;
    this.logger.debug(`Mock verify ${email} → ${status}`);
    return { status };
  }
}
