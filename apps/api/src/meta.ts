import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Instagram API with Instagram Login (no Facebook Page needed). Bump the version before Meta retires it. */
export const GRAPH = 'https://graph.instagram.com/v23.0';
/** Only what the inbox uses; App Review rejects scopes the app doesn't visibly need. */
export const SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages'];
export const REPLY_WINDOW_MS = 24 * 3600_000;

export function metaConfig() {
  const { IG_APP_ID, IG_APP_SECRET, APP_URL } = process.env;
  if (!IG_APP_ID || !IG_APP_SECRET || !APP_URL) {
    throw new ServiceUnavailableException('Instagram API is not configured: set IG_APP_ID, IG_APP_SECRET and APP_URL in apps/api/.env');
  }
  return { appId: IG_APP_ID, secret: IG_APP_SECRET, redirectUri: `${APP_URL.replace(/\/$/, '')}/api/meta/callback`, appUrl: APP_URL.replace(/\/$/, '') };
}

// ponytail: key derived from INTERNAL_JWT_SECRET, so rotating that secret means reconnecting accounts. Use a dedicated key if that becomes a problem.
const key = () => createHash('sha256').update(`reachly-ig-token:${process.env.INTERNAL_JWT_SECRET}`).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(sealed: string): string {
  const [iv, tag, ct] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Webhook POSTs carry `X-Hub-Signature-256: sha256=<hex HMAC of the raw body with the app secret>`. */
export function validWebhookSignature(raw: Buffer | undefined, header: string | undefined, secret: string): boolean {
  if (!raw || !header) return false;
  return safeEqual(header, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
}

/** Meta's deauthorize / data-deletion callbacks send `signed_request` = base64url(sig).base64url(json). */
export function parseSignedRequest(signed: string | undefined, secret: string): { user_id?: string } | null {
  const [sig, payload] = (signed ?? '').split('.');
  if (!sig || !payload) return null;
  if (!safeEqual(sig, createHmac('sha256', secret).update(payload).digest('base64url'))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data?.algorithm?.toUpperCase() === 'HMAC-SHA256' ? data : null;
  } catch {
    return null;
  }
}

/** Calls the Instagram Graph API; Instagram's own error message is passed through as a 502. */
export async function graph<T>(url: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok || data?.error) {
    throw new BadGatewayException(`Instagram: ${data?.error?.message ?? data?.error_message ?? (res ? res.statusText : 'unreachable')}`);
  }
  return data as T;
}
