import type { SendOutcome } from './api';
import { getState, setState } from './state';

/** Steps the Instagram content script understands. The service worker owns all timing. */
export type Command = { type: 'openThread' } | { type: 'focusComposer' } | { type: 'typeChar'; ch: string; typedSoFar: string } | { type: 'submit'; text: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Typing delays run here, in the service worker, not in the page: Chrome throttles timers in
 * background tabs to ≥1 s, but message delivery to a content script is not throttled.
 */
export async function sendDm(handle: string, text: string): Promise<SendOutcome> {
  const tabId = await ensureTab();
  await navigate(tabId, `https://www.instagram.com/${encodeURIComponent(handle)}/`);
  await sleep(rand(1500, 4000)); // look at the profile like a person would

  const opened = await ask(tabId, { type: 'openThread' }, 30_000, 5);
  if (!opened.ok) return opened;
  await sleep(rand(800, 2500));

  const focused = await ask(tabId, { type: 'focusComposer' });
  if (!focused.ok) return focused;
  let typedSoFar = '';
  for (const ch of text) {
    const r = await ask(tabId, { type: 'typeChar', ch, typedSoFar });
    typedSoFar += ch;
    if (!r.ok) return r;
    await sleep(rand(30, 120));
  }
  await sleep(rand(500, 1500));
  return ask(tabId, { type: 'submit', text }, 20_000);
}

async function ensureTab(): Promise<number> {
  const { igTabId } = await getState();
  if (igTabId != null) {
    const tab = await browser.tabs.get(igTabId).catch(() => null);
    if (tab?.url?.startsWith('https://www.instagram.com')) return igTabId;
  }
  const tab = await browser.tabs.create({ url: 'https://www.instagram.com/', active: false, pinned: true });
  await setState({ igTabId: tab.id! });
  await waitForLoad(tab.id!);
  return tab.id!;
}

async function navigate(tabId: number, url: string) {
  await browser.tabs.update(tabId, { url });
  await waitForLoad(tabId);
}

function waitForLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      browser.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    browser.tabs.onUpdated.addListener(listener);
  });
}

/** Sends one step to the content script; retries while the script is still loading. */
async function ask(tabId: number, cmd: Command, timeoutMs = 10_000, retries = 0): Promise<SendOutcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      const timeout = new Promise<SendOutcome>((r) => setTimeout(() => r({ ok: false, error: 'TIMEOUT', detail: `${cmd.type} timed out` }), timeoutMs));
      return await Promise.race([browser.tabs.sendMessage(tabId, cmd) as Promise<SendOutcome>, timeout]);
    } catch (e) {
      if (attempt >= retries) return { ok: false, error: 'UI_CHANGED', detail: `Content script unreachable: ${String(e)}` };
      await sleep(2000);
    }
  }
}
