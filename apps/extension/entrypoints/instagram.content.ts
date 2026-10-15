import type { SendOutcome } from '@/lib/api';
import type { Command } from '@/lib/driver';
import { SEL, TEXT } from '@/lib/selectors';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  main() {
    browser.runtime.onMessage.addListener((msg: Command, _sender, sendResponse) => {
      run(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: 'UNKNOWN', detail: String(e).slice(0, 300) }));
      return true; // async response
    });
  },
});

async function run(cmd: Command): Promise<SendOutcome> {
  switch (cmd.type) {
    case 'openThread':
      return openThread();
    case 'focusComposer': {
      const c = composer();
      if (!c) return { ok: false, error: 'UI_CHANGED', detail: 'Message box not found' };
      c.focus();
      // Clear any unsent draft left in this thread.
      document.execCommand('selectAll');
      document.execCommand('delete');
      return { ok: true };
    }
    case 'typeChar': {
      const c = composer();
      if (!c) return { ok: false, error: 'UI_CHANGED', detail: 'Message box disappeared while typing' };
      if (document.activeElement !== c) c.focus();
      if (cmd.ch === '\n') document.execCommand('insertLineBreak');
      else document.execCommand('insertText', false, cmd.ch);
      return { ok: true };
    }
    case 'submit':
      return submit(cmd.text);
  }
}

async function openThread(): Promise<SendOutcome> {
  const problem = pageProblem();
  if (problem) return problem;
  const button = await waitFor(() => {
    if (TEXT.notFound.test(document.body.innerText)) return 'notFound';
    if (document.querySelector(SEL.loginForm)) return 'login';
    return findByText(TEXT.messageButton);
  }, 15_000);
  if (button === 'notFound') return { ok: false, error: 'USER_NOT_FOUND' };
  if (button === 'login') return { ok: false, error: 'NOT_LOGGED_IN' };
  if (!button) return { ok: false, error: 'CANNOT_MESSAGE', detail: 'No Message button on profile' };

  button.click();
  const box = await waitFor(() => {
    dismissDialogs();
    return composer();
  }, 15_000);
  if (!box) return pageProblem() ?? { ok: false, error: 'UI_CHANGED', detail: 'Chat did not open' };
  return { ok: true };
}

async function submit(expected: string): Promise<SendOutcome> {
  const c = composer();
  if (!c) return { ok: false, error: 'UI_CHANGED', detail: 'Message box not found before sending' };
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (norm(c.innerText) !== norm(expected)) return { ok: false, error: 'UI_CHANGED', detail: 'Typed text does not match the message' };

  const send = findByText(TEXT.sendButton);
  if (send) send.click();
  else c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

  const cleared = await waitFor(() => (norm(composer()?.innerText ?? '') === '' ? true : null), 10_000);
  await new Promise((r) => setTimeout(r, 1500)); // let block dialogs render
  const problem = pageProblem();
  if (problem) return problem;
  return cleared ? { ok: true } : { ok: false, error: 'UI_CHANGED', detail: 'Message did not leave the composer' };
}

function pageProblem(): SendOutcome | null {
  if (location.pathname.startsWith('/accounts/login') || document.querySelector(SEL.loginForm)) return { ok: false, error: 'NOT_LOGGED_IN' };
  const dialogText = [...document.querySelectorAll<HTMLElement>(SEL.dialog)].map((d) => d.innerText).join('\n');
  if (TEXT.rateLimited.test(dialogText)) return { ok: false, error: 'RATE_LIMITED', detail: dialogText.slice(0, 200) };
  if (TEXT.blocked.test(dialogText)) return { ok: false, error: 'ACTION_BLOCKED', detail: dialogText.slice(0, 200) };
  return null;
}

function composer(): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(SEL.composer)].filter((e) => e.offsetParent !== null);
  return all.at(-1) ?? null;
}

function findByText(re: RegExp): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(SEL.clickable)].find((e) => re.test(e.innerText?.trim() ?? '') && e.offsetParent !== null) ?? null;
}

function dismissDialogs() {
  for (const d of document.querySelectorAll<HTMLElement>(SEL.dialog)) {
    [...d.querySelectorAll<HTMLElement>(SEL.clickable)].find((b) => TEXT.dismissButton.test(b.innerText?.trim() ?? ''))?.click();
  }
}

/** Resolves with the first truthy value of fn, re-checked on DOM mutations, or null after timeoutMs. */
function waitFor<T>(fn: () => T | null | undefined, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const first = fn();
    if (first) return resolve(first);
    const obs = new MutationObserver(() => {
      const v = fn();
      if (v) finish(v);
    });
    const timer = setTimeout(() => finish(fn() ?? null), timeoutMs);
    const finish = (v: T | null) => {
      obs.disconnect();
      clearTimeout(timer);
      resolve(v);
    };
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}
