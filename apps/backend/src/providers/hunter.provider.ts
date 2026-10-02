import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type HunterEmailVerifyStatus =
  | 'valid'
  | 'invalid'
  | 'accept_all'
  | 'unknown';

export type HunterDiscoverFilters = Record<string, unknown>;

export type HunterDomainSearchParams = {
  domain: string;
  limit?: number;
  offset?: number;
  type?: string;
  seniority?: string;
  department?: string;
};

export type HunterEmailFinderParams = {
  firstName: string;
  lastName: string;
  domain: string;
};

export type HunterEnrichParams = {
  domain?: string;
  url?: string;
};

@Injectable()
export class HunterProvider {
  private readonly logger = new Logger(HunterProvider.name);
  private readonly baseUrl = 'https://api.hunter.io/v2/';
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('HUNTER_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'HUNTER_API_KEY is missing — Hunter API calls will fail until configured',
      );
    }
    this.apiKey = apiKey || '';
  }

  /** Search companies using Discover filters (Hunter Discover API). */
  async discover(filters: HunterDiscoverFilters = {}): Promise<unknown> {
    return this.request('POST', 'discover', undefined, filters);
  }

  /** List contacts associated with a company domain. */
  async domainSearch(params: HunterDomainSearchParams): Promise<unknown> {
    const query: Record<string, string> = {
      domain: params.domain,
    };
    if (params.limit != null) query.limit = String(params.limit);
    if (params.offset != null) query.offset = String(params.offset);
    if (params.type) query.type = params.type;
    if (params.seniority) query.seniority = params.seniority;
    if (params.department) query.department = params.department;

    return this.request('GET', 'domain-search', query);
  }

  /** Find a professional email for a person at a domain. */
  async emailFinder(params: HunterEmailFinderParams): Promise<unknown> {
    return this.request('GET', 'email-finder', {
      domain: params.domain,
      first_name: params.firstName,
      last_name: params.lastName,
    });
  }

  /**
   * Verify an email address.
   * Normalizes Hunter statuses to: valid | invalid | accept_all | unknown.
   */
  async emailVerifier(email: string): Promise<{
    status: HunterEmailVerifyStatus;
    score: number | null;
    email: string;
    raw: unknown;
  }> {
    const raw = (await this.request('GET', 'email-verifier', {
      email,
    })) as {
      data?: { status?: string; score?: number; email?: string; accept_all?: boolean };
    };

    const hunterStatus = (raw?.data?.status || '').toLowerCase();
    let status: HunterEmailVerifyStatus;

    if (hunterStatus === 'valid') {
      status = 'valid';
    } else if (hunterStatus === 'invalid') {
      status = 'invalid';
    } else if (
      hunterStatus === 'accept_all' ||
      raw?.data?.accept_all === true
    ) {
      status = 'accept_all';
    } else {
      status = 'unknown';
    }

    return {
      status,
      score: typeof raw?.data?.score === 'number' ? raw.data.score : null,
      email: raw?.data?.email || email,
      raw,
    };
  }

  /**
   * Enrich company (and related) information from a domain or company URL.
   * Maps to Hunter Company Enrichment (`companies/find`).
   */
  async enrich(params: HunterEnrichParams): Promise<unknown> {
    const domain = this.resolveDomain(params.domain, params.url);
    if (!domain) {
      throw new BadRequestException(
        'Provide a company domain or URL to enrich',
      );
    }
    return this.request('GET', 'companies/find', { domain });
  }

  private resolveDomain(domain?: string, url?: string): string | null {
    const raw = (domain || url || '').trim();
    if (!raw) return null;

    try {
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const hostname = new URL(withProtocol).hostname.replace(/^www\./i, '');
      return hostname || null;
    } catch {
      return raw
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .trim() || null;
    }
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    query?: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'HUNTER_API_KEY is not configured',
      );
    }

    const url = new URL(path, this.baseUrl);
    url.searchParams.set('api_key', this.apiKey);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers:
          method === 'POST'
            ? { 'Content-Type': 'application/json', Accept: 'application/json' }
            : { Accept: 'application/json' },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });

      const text = await res.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = { message: text };
        }
      }

      if (!res.ok) {
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'errors' in payload
            ? JSON.stringify((payload as { errors: unknown }).errors)
            : `Hunter API ${res.status}`;
        this.logger.error(`Hunter ${method} ${path} failed: ${message}`);
        throw new ServiceUnavailableException(
          `Hunter API request failed: ${message}`,
        );
      }

      return payload;
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Unknown Hunter error';
      this.logger.error(`Hunter ${method} ${path} error: ${message}`);
      throw new ServiceUnavailableException(
        `Hunter API request failed: ${message}`,
      );
    }
  }
}
