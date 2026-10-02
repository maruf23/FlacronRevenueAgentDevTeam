import { randomUUID } from 'crypto';

/**
 * Deliverability helpers.
 *
 * Free consumer mailboxes (gmail.com / outlook.com / yahoo.com) must look like
 * personal 1:1 mail — brand From names, List-Unsubscribe, and HTML multipart
 * push Gmail straight to Spam.
 *
 * Custom domains can use commercial compliance headers.
 */

const FREE_MAILBOX_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

const SPAMMY_SUBJECT_RE =
  /\b(unlock|free|guaranteed|limited|act now|ai[- ]?powered|revolutionary|exclusive offer| Congrats|winner|\$|!!!|click here)\b/i;

export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] ?? from).trim().toLowerCase();
}

export function emailDomain(address: string): string {
  return extractEmailAddress(address).split('@')[1] || '';
}

export function isFreeMailbox(address: string): boolean {
  return FREE_MAILBOX_DOMAINS.has(emailDomain(address));
}

/** Turn local-part "marufhossen23" → "Maruf Hossen" when possible. */
export function humanizeLocalPart(email: string): string {
  const local = extractEmailAddress(email).split('@')[0] || 'there';
  const cleaned = local
    .replace(/[0-9._+-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  // Split camel/joined names roughly: marufhossen → Maruf Hossen if long enough
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map(capitalize).join(' ');
  }

  const single = parts[0] || local.replace(/[0-9]/g, '');
  // Heuristic: insert space before last name-ish chunk of 4+ letters
  const split = single.match(/^([a-z]{3,12})([a-z]{4,})$/i);
  if (split) {
    return `${capitalize(split[1])} ${capitalize(split[2])}`;
  }
  return capitalize(single) || 'Hello';
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Format From for inbox placement.
 * Free mailboxes: always use a personal-looking name (never a product brand).
 */
export function formatFromAddress(
  rawFrom: string,
  options?: { brandName?: string; personalName?: string },
): string {
  const trimmed = rawFrom.trim();
  const email = extractEmailAddress(trimmed);
  const brand = options?.brandName?.trim() || 'Flacron Lead Agent';
  const personal =
    options?.personalName?.trim() || humanizeLocalPart(email || trimmed);

  if (!trimmed) return `${personal} <noreply@localhost>`;

  if (isFreeMailbox(email || trimmed)) {
    // Strip any brand display name — Gmail + brand From = spam
    return `${personal} <${email || trimmed}>`;
  }

  // Custom domain: keep explicit display name if provided
  if (/^.+\s*<[^>]+>$/.test(trimmed)) {
    // If display name looks like a product brand on a free mailbox we already handled;
    // on custom domains, keep as-is unless it's empty
    return trimmed;
  }

  if (email.includes('@')) {
    return `${brand} <${email}>`;
  }

  return trimmed;
}

export function buildMessageId(fromAddress: string): string {
  const domain = emailDomain(fromAddress) || 'localhost';
  return `<${randomUUID()}@${domain}>`;
}

export function buildListUnsubscribeHeaders(fromAddress: string): {
  'List-Unsubscribe': string;
  'List-Unsubscribe-Post': string;
} | null {
  // Do NOT add these on free mailboxes — they mark the message as bulk.
  if (isFreeMailbox(fromAddress)) return null;

  const email = extractEmailAddress(fromAddress);
  return {
    'List-Unsubscribe': `<mailto:${email}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export function appendUnsubscribeFooter(
  body: string,
  fromAddress: string,
): string {
  // Personal free-mailbox sends should not include opt-out footers.
  if (isFreeMailbox(fromAddress)) return body.trim();

  const email = extractEmailAddress(fromAddress);
  const marker = "If this isn't relevant";
  if (body.includes(marker) || body.toLowerCase().includes('unsubscribe')) {
    return body;
  }

  return `${body.trim()}\n\n—\nIf this isn't relevant, reply "unsubscribe" or email ${email} and I won't follow up.`;
}

export function plainTextToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br/>'))
    .map(
      (p) =>
        `<p style="margin:0 0 1em 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${p}</p>`,
    )
    .join('');

  return `<!DOCTYPE html><html><body>${paragraphs}</body></html>`;
}

export function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

/** Last-resort subject cleanup before send. */
export function sanitizeSubjectForInbox(subject: string): string {
  let s = subject.trim().replace(/\s+/g, ' ');
  s = s.replace(/[!?]{2,}/g, '?');
  if (SPAMMY_SUBJECT_RE.test(s) || s.length > 60) {
    // Fall back to a neutral personal subject
    return 'Quick question';
  }
  return s;
}
