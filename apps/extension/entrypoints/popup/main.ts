import { api, type AccountStats } from '@/lib/api';
import { getState, WEB_URL } from '@/lib/state';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const send = (msg: object) => browser.runtime.sendMessage(msg);

let accounts: AccountStats[] = [];

async function loadAccounts() {
  const { token } = await getState();
  if (!token) return;
  try {
    accounts = (await api<{ accounts: AccountStats[] }>(token, 'GET', '/extension/state')).accounts;
    $('conn').textContent = 'Connected';
  } catch {
    $('conn').textContent = 'Offline';
  }
}

async function render() {
  const s = await getState();
  $('version').textContent = browser.runtime.getManifest().version;
  $('disconnected').hidden = !!s.token;
  $('connected').hidden = !s.token;
  if (!s.token) $('conn').textContent = 'Not connected';

  const select = $<HTMLSelectElement>('account');
  select.innerHTML = accounts.length ? '' : '<option value="">Add an Instagram account in Settings</option>';
  for (const a of accounts) select.add(new Option(`@${a.handle}`, a.id, false, a.id === s.igAccountId));
  if (!s.igAccountId && accounts[0]) await send({ type: 'setAccount', igAccountId: accounts[0].id });

  const acct = accounts.find((a) => a.id === s.igAccountId) ?? accounts[0];
  $('sent').textContent = String(acct?.sent24h ?? 0);
  $('limit').textContent = String(acct?.dailyLimit ?? 0);
  $('queued').textContent = String(acct?.queued ?? 0);
  $('bar').style.width = `${acct ? Math.min(100, (acct.sent24h / acct.dailyLimit) * 100) : 0}%`;

  const kind = acct?.pausedReason ? 'paused' : s.running ? s.status.kind : 'idle';
  $('dot').className = `dot ${kind}`;
  $('statusKind').textContent = { idle: 'Stopped', sending: 'Running', waiting: 'Running', paused: 'Paused', error: 'Error' }[kind];
  $('statusMsg').textContent = acct?.pausedReason ? `Paused: ${acct.pausedReason}` : s.running ? s.status.message : 'Stopped';
  $('current').hidden = !s.current;
  if (s.current) $('current').textContent = `Now: ${s.current.name ?? ''} @${s.current.handle}`;

  $<HTMLButtonElement>('start').disabled = s.running || !acct;
  $<HTMLButtonElement>('stop').disabled = !s.running;
  $<HTMLInputElement>('startWithChrome').checked = s.startWithChrome;
}

$('account').addEventListener('change', (e) => send({ type: 'setAccount', igAccountId: (e.target as HTMLSelectElement).value }));
$('start').addEventListener('click', () => send({ type: 'start' }));
$('stop').addEventListener('click', () => send({ type: 'stop' }));
$('startWithChrome').addEventListener('change', (e) => send({ type: 'setStartWithChrome', value: (e.target as HTMLInputElement).checked }));
$('openSettings').addEventListener('click', () => browser.tabs.create({ url: `${WEB_URL}/settings` }));
$('openDashboard').addEventListener('click', () => browser.tabs.create({ url: `${WEB_URL}/dashboard` }));
browser.storage.onChanged.addListener(() => render());

loadAccounts().then(render);
setInterval(() => loadAccounts().then(render), 10_000);
