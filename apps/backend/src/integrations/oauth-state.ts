import { createHmac, timingSafeEqual } from 'crypto';

export type OAuthStatePayload = {
  workspaceId: string;
  userId: string;
  provider: 'gmail' | 'microsoft';
  nonce: string;
  exp: number;
};

export function signOAuthState(
  payload: Omit<OAuthStatePayload, 'exp' | 'nonce'> & { nonce?: string },
  secret: string,
  ttlSeconds = 600,
): string {
  const body: OAuthStatePayload = {
    workspaceId: payload.workspaceId,
    userId: payload.userId,
    provider: payload.provider,
    nonce: payload.nonce ?? randomNonce(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const json = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = createHmac('sha256', secret).update(json).digest('base64url');
  return `${json}.${sig}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
): OAuthStatePayload {
  const [json, sig] = state.split('.');
  if (!json || !sig) {
    throw new Error('Invalid OAuth state');
  }
  const expected = createHmac('sha256', secret).update(json).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('OAuth state signature mismatch');
  }
  const payload = JSON.parse(
    Buffer.from(json, 'base64url').toString('utf8'),
  ) as OAuthStatePayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('OAuth state expired');
  }
  return payload;
}

function randomNonce(): string {
  return createHmac('sha256', String(Date.now()))
    .update(Math.random().toString())
    .digest('hex')
    .slice(0, 16);
}
