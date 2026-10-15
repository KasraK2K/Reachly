export const LEAD_STATUSES = ['New', 'Contacted', 'Replied', 'Converted', 'NotInterested'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CAMPAIGN_STATUSES = ['Draft', 'Active', 'Paused', 'Completed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const JOB_STATES = ['Queued', 'Claimed', 'Sent', 'Failed', 'Skipped'] as const;
export type JobState = (typeof JOB_STATES)[number];

/** Error codes the extension reports. BLOCKING ones pause the account immediately. */
export const SEND_ERRORS = [
  'NOT_LOGGED_IN',
  'ACTION_BLOCKED',
  'RATE_LIMITED',
  'WRONG_ACCOUNT',
  'USER_NOT_FOUND',
  'CANNOT_MESSAGE',
  'UI_CHANGED',
  'TIMEOUT',
  'UNKNOWN',
] as const;
export type SendError = (typeof SEND_ERRORS)[number];
export const BLOCKING_ERRORS: readonly SendError[] = ['NOT_LOGGED_IN', 'ACTION_BLOCKED', 'RATE_LIMITED', 'WRONG_ACCOUNT'];
/** Errors that are about the lead, not the account: skip the lead, don't count toward auto-pause. */
export const LEAD_ERRORS: readonly SendError[] = ['USER_NOT_FOUND', 'CANNOT_MESSAGE'];

export const MERGE_FIELDS = ['name', 'first_name', 'handle', 'niche', 'industry'] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export interface MergeData {
  name?: string | null;
  handle?: string | null;
  niche?: string | null;
  industry?: string | null;
}

/** "@Some.User", "https://instagram.com/some.user/?x" -> "some.user". Returns null if not a valid handle. */
export function normalizeHandle(input: string): string | null {
  let h = input.trim().toLowerCase();
  const url = h.match(/instagram\.com\/([^/?#]+)/);
  if (url) h = url[1];
  h = h.replace(/^@/, '');
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

function fieldValue(field: MergeField, d: MergeData): string {
  const v = field === 'first_name' ? d.name?.trim().split(/\s+/)[0] : d[field];
  return v?.trim() ?? '';
}

/**
 * Renders a template: merge fields `{{name}}` / `{{name|fallback}}`, then spintax `{a|b|c}` (nestable).
 * Merge values are substituted after spintax so braces or pipes inside lead data are never parsed.
 */
export function renderTemplate(body: string, data: MergeData, random: () => number = Math.random): string {
  const values: string[] = [];
  let out = body.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (_, field: string, fallback?: string) => {
    const v = (MERGE_FIELDS as readonly string[]).includes(field) ? fieldValue(field as MergeField, data) : '';
    values.push(v || (fallback ?? '').trim());
    return `\u0000${values.length - 1}\u0000`;
  });
  const inner = /\{([^{}]*)\}/;
  while (inner.test(out)) {
    out = out.replace(inner, (_, opts: string) => {
      const parts = opts.split('|');
      return parts[Math.floor(random() * parts.length)];
    });
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => values[Number(i)]).replace(/[ \t]{2,}/g, ' ').trim();
}

/** Problems that make a template unsafe to send. Empty array = ok. */
export function templateErrors(body: string): string[] {
  const errors: string[] = [];
  if (!body.trim()) errors.push('Message is empty');
  for (const [, field] of body.matchAll(/\{\{\s*(\w+)\s*(?:\|[^}]*)?\}\}/g)) {
    if (!(MERGE_FIELDS as readonly string[]).includes(field)) errors.push(`Unknown merge field {{${field}}}`);
  }
  let depth = 0;
  for (const ch of body.replace(/\{\{[^}]*\}\}/g, '')) {
    if (ch === '{') depth++;
    if (ch === '}' && --depth < 0) break;
  }
  if (depth !== 0) errors.push('Unbalanced { } in spintax');
  if (body.length > 1000) errors.push('Message is longer than 1000 characters');
  return errors;
}

/** Number of distinct spintax combinations (rough variety indicator for the editor). */
export function spintaxVariants(body: string): number {
  let out = body.replace(/\{\{[^}]*\}\}/g, '');
  const inner = /\{([^{}]*)\}/;
  const counts: number[] = [];
  while (inner.test(out)) {
    out = out.replace(inner, (_, opts: string) => {
      counts.push(opts.split('|').length);
      return '';
    });
  }
  return counts.reduce((a, b) => a * b, 1);
}
