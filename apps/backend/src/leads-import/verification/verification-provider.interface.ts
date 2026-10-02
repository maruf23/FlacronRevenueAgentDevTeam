export type ProviderVerificationStatus =
  | 'verified'
  | 'catch_all'
  | 'invalid'
  | 'risky';

export type VerificationResult = {
  status: ProviderVerificationStatus;
};

export const VERIFICATION_PROVIDER = Symbol('VERIFICATION_PROVIDER');

export interface VerificationProvider {
  verify(email: string): Promise<VerificationResult>;
}
