export const API_URL: string = import.meta.env.WXT_API_URL ?? 'http://localhost:4000';
export const WEB_URL: string = import.meta.env.WXT_WEB_URL ?? 'http://localhost:3000';

export interface Status {
  kind: 'idle' | 'sending' | 'waiting' | 'paused' | 'error';
  message: string;
  at: number;
}

export interface State {
  token: string | null;
  igAccountId: string | null;
  running: boolean;
  startWithChrome: boolean;
  status: Status;
  current: { handle: string; name: string | null } | null;
  /** Last pause reason we notified about, so one pause = one desktop notification. */
  notifiedPause: string | null;
  igTabId: number | null;
}

const DEFAULTS: State = {
  token: null,
  igAccountId: null,
  running: false,
  startWithChrome: false,
  status: { kind: 'idle', message: 'Stopped', at: 0 },
  current: null,
  notifiedPause: null,
  igTabId: null,
};

export async function getState(): Promise<State> {
  const s = await browser.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...s } as State;
}

export function setState(patch: Partial<State>) {
  return browser.storage.local.set(patch);
}

export const setStatus = (kind: Status['kind'], message: string) => setState({ status: { kind, message, at: Date.now() } });
