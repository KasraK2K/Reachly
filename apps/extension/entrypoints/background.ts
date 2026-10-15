import { api, ApiError, type ClaimResult } from '@/lib/api';
import { sendDm } from '@/lib/driver';
import { getState, setState, setStatus, WEB_URL } from '@/lib/state';

const VERSION = browser.runtime.getManifest().version;
/** Never sleep longer than this, so a resume/start in the web app is picked up quickly. */
const MAX_WAIT_SEC = 300;

let busy = false;

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(setup);
  browser.runtime.onStartup.addListener(async () => {
    const s = await getState();
    await setState({ running: s.startWithChrome && !!s.token && !!s.igAccountId, igTabId: null });
    await setup();
  });

  browser.alarms.onAlarm.addListener(async (a) => {
    if (a.name === 'heartbeat') {
      await heartbeat();
      // Self-heal: a service worker restart can lose the pending 'work' alarm.
      if ((await getState()).running && !(await browser.alarms.get('work'))) schedule(5);
    }
    if (a.name === 'work') await work();
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });
});

async function setup() {
  await browser.alarms.create('heartbeat', { periodInMinutes: 1 });
  const id = 'reachly-webapp';
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!registered.length) {
    await browser.scripting.registerContentScripts([{ id, matches: [`${WEB_URL}/*`], js: ['content-scripts/webapp.js'], runAt: 'document_idle' }]);
  }
  if ((await getState()).running) schedule(5);
}

type Msg = { type: 'pair'; token: string } | { type: 'start' } | { type: 'stop' } | { type: 'setAccount'; igAccountId: string } | { type: 'setStartWithChrome'; value: boolean };

async function handleMessage(msg: Msg, sender: { url?: string; id?: string }) {
  switch (msg.type) {
    case 'pair':
      // Only the Reachly web app may hand us a token.
      if (!sender.url?.startsWith(`${WEB_URL}/`)) return { ok: false };
      await setState({ token: msg.token, notifiedPause: null });
      await setStatus('idle', 'Connected. Pick an account and press Start.');
      return { ok: true };
    case 'start':
      await setState({ running: true });
      await setStatus('waiting', 'Starting…');
      schedule(1);
      return { ok: true };
    case 'stop':
      await setState({ running: false });
      await browser.alarms.clear('work');
      await setStatus('idle', 'Stopped');
      return { ok: true };
    case 'setAccount':
      await setState({ igAccountId: msg.igAccountId, notifiedPause: null });
      await heartbeat();
      return { ok: true };
    case 'setStartWithChrome':
      await setState({ startWithChrome: msg.value });
      return { ok: true };
  }
}

function schedule(sec: number) {
  browser.alarms.create('work', { when: Date.now() + Math.min(sec, MAX_WAIT_SEC) * 1000 });
}

async function igUserId(): Promise<string | null> {
  const c = await browser.cookies.get({ url: 'https://www.instagram.com', name: 'ds_user_id' });
  return c?.value ?? null;
}

async function heartbeat() {
  const s = await getState();
  if (!s.token || !s.igAccountId) return;
  try {
    await api(s.token, 'POST', '/extension/heartbeat', { igAccountId: s.igAccountId, igUserId: await igUserId(), version: VERSION });
  } catch (e) {
    await handleApiError(e);
  }
}

async function work() {
  if (busy) return;
  const s = await getState();
  if (!s.running || !s.token || !s.igAccountId) return;
  busy = true;
  try {
    const r = await api<ClaimResult>(s.token, 'POST', '/extension/claim', { igAccountId: s.igAccountId, igUserId: await igUserId(), version: VERSION });
    if ('wait' in r) {
      if (r.wait === 'PAUSED') {
        await setStatus('paused', r.message);
        await notifyPause(r.message);
      } else {
        await setState({ notifiedPause: null });
        await setStatus('waiting', r.message);
      }
      return schedule(r.retryAfterSec);
    }

    await setState({ current: { handle: r.job.handle, name: r.job.leadName } });
    await setStatus('sending', `Sending to @${r.job.handle}`);
    const outcome = await sendDm(r.job.handle, r.job.text);
    const res = await api<{ paused: boolean; pausedReason?: string }>(s.token, 'POST', `/extension/jobs/${r.job.id}/result`, outcome);
    if (res.paused && res.pausedReason) {
      await setStatus('paused', res.pausedReason);
      await notifyPause(res.pausedReason);
    }
    // The server decides the real delay; asking again soon just returns PACING with the exact wait.
    schedule(5);
  } catch (e) {
    await handleApiError(e);
    if ((await getState()).running) schedule(60);
  } finally {
    busy = false;
    await setState({ current: null });
  }
}

async function handleApiError(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    await setState({ running: false, token: null });
    await setStatus('error', 'Disconnected. Reconnect from Reachly → Settings.');
  } else {
    await setStatus('error', e instanceof Error ? e.message : String(e));
  }
}

async function notifyPause(reason: string) {
  const s = await getState();
  if (s.notifiedPause === reason) return;
  await setState({ notifiedPause: reason });
  await browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: 'Reachly paused sending',
    message: `${reason}. Check Instagram, then resume from the dashboard.`,
  });
}
