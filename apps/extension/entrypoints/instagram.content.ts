import type { SendOutcome } from '@/lib/api';
import type { Command } from '@/lib/driver';
import { CHECKPOINT_PATH, SEL, TEXT } from '@/lib/selectors';

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
      // Box emptied mid-message: Instagram sent what was typed so far. Stop before anything else goes out.
      if (norm(cmd.typedSoFar) && !norm(c.innerText)) {
        return { ok: false, error: 'PARTIAL_SEND', detail: `the box emptied after "${norm(cmd.typedSoFar).slice(-40)}"` };
      }
      if (cmd.ch === '\n') pasteText(c, '\n');
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
  const typed = norm(c.innerText);
  if (typed !== norm(expected)) {
    // Show where they diverge, so a composer quirk (line breaks, emoji, autocorrect) can be fixed from the report.
    let i = 0;
    while (i < typed.length && typed[i] === norm(expected)[i]) i++;
    return { ok: false, error: 'UI_CHANGED', detail: `Typed text does not match the message at char ${i}: box has "${typed.slice(Math.max(0, i - 20), i + 40)}"` };
  }

  const send = findByText(TEXT.sendButton);
  if (send) send.click();
  else c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

  const cleared = await waitFor(() => (norm(composer()?.innerText ?? '') === '' ? true : null), 10_000);
  await new Promise((r) => setTimeout(r, 1500)); // let block dialogs render
  const problem = pageProblem();
  if (problem) return problem;
  return cleared ? { ok: true } : { ok: false, error: 'UI_CHANGED', detail: 'Message did not leave the composer' };
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Instagram's composer treats a typed line break (Enter, or execCommand insertLineBreak) as "send".
 * A plain-text paste goes through the editor's paste path, which inserts the newline instead.
 */
function pasteText(el: HTMLElement, text: string) {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}

function pageProblem(): SendOutcome | null {
  if (CHECKPOINT_PATH.test(location.pathname)) {
    return { ok: false, error: 'ACTION_BLOCKED', detail: `Instagram is asking you to verify or unlock the account (${location.pathname})` };
  }
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
