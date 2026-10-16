import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { InboxService } from '../src/inbox.service';
import { decrypt, encrypt, parseSignedRequest, validWebhookSignature } from '../src/meta';
import { PrismaService } from '../src/prisma.service';

const SECRET = 'app-secret';

test('webhook signature and signed_request checks', () => {
  const raw = Buffer.from('{"object":"instagram"}');
  const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
  assert.equal(validWebhookSignature(raw, sig, SECRET), true);
  assert.equal(validWebhookSignature(Buffer.from('{"object":"x"}'), sig, SECRET), false);
  assert.equal(validWebhookSignature(raw, undefined, SECRET), false);

  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '42' })).toString('base64url');
  const signed = `${createHmac('sha256', SECRET).update(payload).digest('base64url')}.${payload}`;
  assert.equal(parseSignedRequest(signed, SECRET)?.user_id, '42');
  assert.equal(parseSignedRequest(signed, 'other'), null);
  assert.equal(parseSignedRequest('junk', SECRET), null);

  assert.equal(decrypt(encrypt('token-123')), 'token-123');
  assert.notEqual(encrypt('a'), encrypt('a'));
});

// --- Webhook ingestion against a real Postgres (skipped when DATABASE_URL is unreachable) ---
const db = new PrismaService();
const inbox = new InboxService(db);
let dbUp = false;
let userId = '';
let acctId = '';
let leadId = '';
const realFetch = globalThis.fetch;

before(async () => {
  try {
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    return;
  }
  const user = await db.user.create({ data: { email: `inbox-test-${Date.now()}@test.local` } });
  userId = user.id;
  const acct = await db.igAccount.create({ data: { userId, handle: 'sender' } });
  acctId = acct.id;
  await db.igConnection.create({ data: { igAccountId: acct.id, graphUserId: `biz-${Date.now()}`, appUserId: `app-${Date.now()}`, username: 'sender', accessToken: encrypt('tok'), expiresAt: new Date(Date.now() + 86400_000) } });
  const lead = await db.lead.create({ data: { userId, handle: 'jane', status: 'Contacted' } });
  leadId = lead.id;
  const tpl = await db.template.create({ data: { userId, name: 't', body: 'hi' } });
  await db.campaign.create({
    data: { userId, igAccountId: acct.id, name: 'c', status: 'Active', jobs: { create: [{ leadId, templateId: tpl.id, step: 1, renderedText: 'follow-up', dueAt: new Date(Date.now() + 86400_000) }] } },
  });
  // Stand-in for the Graph API: profile lookup and thread history.
  globalThis.fetch = (async (url: string) => {
    const body = String(url).includes('/me/conversations')
      ? { data: [{ messages: { data: [{ id: 'm-cold', created_time: '2026-01-01T10:00:00Z', from: { id: 'self' }, message: 'cold dm' }] } }] }
      : { username: 'Jane', name: 'Jane Doe' };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (dbUp) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test('ingest: reply creates the thread, marks the lead Replied and cancels follow-ups', async (t) => {
  if (!dbUp) return t.skip('database not reachable');
  const conn = await db.igConnection.findUniqueOrThrow({ where: { igAccountId: acctId } });
  const event = (mid: string, from: string, to: string, extra = {}) => ({
    object: 'instagram',
    entry: [{ id: conn.graphUserId, messaging: [{ sender: { id: from }, recipient: { id: to }, timestamp: Date.now(), message: { mid, text: 'hey!', ...extra } }] }],
  });

  // Our own echo to someone with no thread yet is ignored.
  await inbox.ingest(event('m-echo', conn.graphUserId, 'stranger', { is_echo: true }));
  assert.equal(await db.conversation.count({ where: { igAccountId: acctId } }), 0);

  await inbox.ingest(event('m-1', 'igsid-jane', conn.graphUserId));
  await inbox.ingest(event('m-1', 'igsid-jane', conn.graphUserId)); // Meta retry
  const convo = await db.conversation.findUniqueOrThrow({ where: { igAccountId_igsid: { igAccountId: acctId, igsid: 'igsid-jane' } }, include: { messages: true } });
  assert.equal(convo.handle, 'jane');
  assert.equal(convo.leadId, leadId);
  assert.equal(convo.unread, true);
  assert.ok(convo.lastInboundAt);
  assert.deepEqual(convo.messages.map((m) => m.mid).sort(), ['m-1', 'm-cold']);

  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status, 'Replied');
  const job = await db.sendJob.findFirstOrThrow({ where: { leadId } });
  assert.equal(job.state, 'Skipped');

  // A reply from the Instagram app shows up as ours and clears unread.
  await inbox.ingest(event('m-2', conn.graphUserId, 'igsid-jane', { is_echo: true }));
  const after2 = await db.conversation.findUniqueOrThrow({ where: { id: convo.id }, include: { messages: { where: { mid: 'm-2' } } } });
  assert.equal(after2.unread, false);
  assert.equal(after2.messages[0].fromMe, true);

  // Data deletion removes the token and the threads.
  assert.equal(await inbox.forget(conn.appUserId, true), 1);
  assert.equal(await db.conversation.count({ where: { igAccountId: acctId } }), 0);
  assert.equal(await db.igConnection.count({ where: { igAccountId: acctId } }), 0);
});
