export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  scope?: string;
  accountEmail: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  accessToken: string;
  fromEmail?: string;
};

export type SendEmailResult = {
  providerMessageId?: string;
  /** Gmail threadId / Microsoft conversationId */
  providerThreadId?: string;
};

export type FetchedInboundEmail = {
  externalId: string;
  threadId?: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  receivedAt?: string;
};

export interface EmailOAuthAdapter {
  readonly provider: 'gmail' | 'microsoft';
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet>;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
