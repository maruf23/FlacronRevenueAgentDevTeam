import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * TOKEN_ENCRYPTION_KEY may be any secret string (hashed to 32 bytes).
 */
@Injectable()
export class TokenEncryptionService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const secret =
      this.config.get<string>('TOKEN_ENCRYPTION_KEY') ||
      this.config.get<string>('JWT_SECRET');

    if (!secret || secret.length < 16) {
      throw new InternalServerErrorException(
        'TOKEN_ENCRYPTION_KEY (or JWT_SECRET) must be set to encrypt OAuth tokens',
      );
    }

    if (!this.config.get<string>('TOKEN_ENCRYPTION_KEY')) {
      // eslint-disable-next-line no-console
      console.warn(
        '[TokenEncryption] TOKEN_ENCRYPTION_KEY unset — falling back to JWT_SECRET',
      );
    }

    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }
}
