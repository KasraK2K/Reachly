import type { SendError } from '@reachly/shared';
import { API_URL } from './state';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, [data.message].flat().join(', ') || res.statusText);
  }
  return res.json();
}

export type ClaimResult =
  | { job: { id: string; handle: string; text: string; leadName: string | null } }
  | { wait: string; retryAfterSec: number; message: string };

export type SendOutcome = { ok: true } | { ok: false; error: SendError; detail?: string };

export interface AccountStats {
  id: string;
  handle: string;
  igUserId: string | null;
  dailyLimit: number;
  sent24h: number;
  queued: number;
  pausedReason: string | null;
  online: boolean;
}
