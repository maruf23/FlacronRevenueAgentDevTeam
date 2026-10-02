import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';

export type DnsRecordStatus = 'valid' | 'invalid' | 'missing';

export type DomainAuthCheck = {
  domain: string;
  spf: DnsRecordStatus;
  dkim: DnsRecordStatus;
  dmarc: DnsRecordStatus;
  details?: {
    spfRecord?: string | null;
    dkimSelector?: string | null;
    dkimRecord?: string | null;
    dmarcRecord?: string | null;
  };
};

@Injectable()
export class DomainDnsService {
  private readonly logger = new Logger(DomainDnsService.name);

  constructor(private readonly config: ConfigService) {}

  async checkDomain(domain: string): Promise<DomainAuthCheck> {
    const normalized = this.normalizeDomain(domain);
    const [spf, dkim, dmarc] = await Promise.all([
      this.checkSpf(normalized),
      this.checkDkim(normalized),
      this.checkDmarc(normalized),
    ]);

    return {
      domain: normalized,
      spf: spf.status,
      dkim: dkim.status,
      dmarc: dmarc.status,
      details: {
        spfRecord: spf.record,
        dkimSelector: dkim.selector,
        dkimRecord: dkim.record,
        dmarcRecord: dmarc.record,
      },
    };
  }

  private normalizeDomain(value: string): string {
    let domain = value.trim().toLowerCase();
    if (domain.includes('@')) {
      domain = domain.split('@').pop() ?? domain;
    }
    // Strip UI suffixes: "flacron.ai (connected)"
    domain = domain.split(/\s+/)[0] ?? domain;
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    domain = domain.replace(/^\.+|\.+$/g, '');
    const emailLike = domain.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (emailLike) {
      domain = emailLike[0].split('@')[1] ?? domain;
    }
    return domain;
  }

  private async resolveTxt(name: string): Promise<string[]> {
    try {
      const records = await dns.resolveTxt(name);
      return records.map((parts) => parts.join(''));
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'EREFUSED') {
        return [];
      }
      this.logger.debug(
        `TXT lookup failed for ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private async checkSpf(domain: string): Promise<{
    status: DnsRecordStatus;
    record: string | null;
  }> {
    const records = await this.resolveTxt(domain);
    const spf = records.find((r) => r.toLowerCase().startsWith('v=spf1'));
    if (!spf) return { status: 'missing', record: null };

    const lower = spf.toLowerCase();
    // Soft validity: must be SPF v1 and not an explicit hard-fail-all with no includes
    // Invalid if multiple SPF records (common misconfig) or missing all/redirect mechanism
    const spfCount = records.filter((r) =>
      r.toLowerCase().startsWith('v=spf1'),
    ).length;
    if (spfCount > 1) return { status: 'invalid', record: spf };
    if (!/\s(-all|~all|\+all|\?all|redirect=)/i.test(lower) && !lower.includes('all')) {
      // still accept if it has include/a/mx mechanisms without terminal all (technically incomplete)
      if (!/(include:|a:|mx:|\sip4:|\sip6:)/i.test(lower)) {
        return { status: 'invalid', record: spf };
      }
    }
    return { status: 'valid', record: spf };
  }

  private async checkDkim(domain: string): Promise<{
    status: DnsRecordStatus;
    record: string | null;
    selector: string | null;
  }> {
    const configured = this.config.get<string>('SMTP_DKIM_SELECTOR')?.trim();
    const selectors = [
      ...(configured ? [configured] : []),
      'google',
      'default',
      'selector1',
      'selector2',
      'k1',
      's1',
      's2',
    ];
    const unique = [...new Set(selectors)];

    for (const selector of unique) {
      const name = `${selector}._domainkey.${domain}`;
      const records = await this.resolveTxt(name);
      const dkim = records.find((r) => /v\s*=\s*DKIM1/i.test(r) || /p\s*=/i.test(r));
      if (!dkim) continue;
      const hasPublicKey = /p\s*=\s*[A-Za-z0-9+/=]+/i.test(dkim);
      if (!hasPublicKey) {
        return { status: 'invalid', record: dkim, selector };
      }
      return { status: 'valid', record: dkim, selector };
    }

    return { status: 'missing', record: null, selector: configured ?? null };
  }

  private async checkDmarc(domain: string): Promise<{
    status: DnsRecordStatus;
    record: string | null;
  }> {
    const records = await this.resolveTxt(`_dmarc.${domain}`);
    const dmarc = records.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
    if (!dmarc) return { status: 'missing', record: null };

    const policyMatch = dmarc.match(/\bp\s*=\s*(none|quarantine|reject)\b/i);
    if (!policyMatch) return { status: 'invalid', record: dmarc };
    return { status: 'valid', record: dmarc };
  }
}
