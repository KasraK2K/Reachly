import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { EngineService, inQuietHours } from '../src/engine.service';
import { PrismaService } from '../src/prisma.service';

test('inQuietHours handles wrap-around windows and timezones', () => {
  const at = (iso: string) => new Date(iso);
  assert.equal(inQuietHours(at('2026-01-01T23:00:00Z'), 'UTC', '22:00', '07:00'), true);
  assert.equal(inQuietHours(at('2026-01-01T06:59:00Z'), 'UTC', '22:00', '07:00'), true);
  assert.equal(inQuietHours(at('2026-01-01T07:00:00Z'), 'UTC', '22:00', '07:00'), false);
  assert.equal(inQuietHours(at('2026-01-01T12:00:00Z'), 'UTC', '13:00', '14:00'), false);
  // 23:00 UTC is 08:00 next day in Tokyo.
  assert.equal(inQuietHours(at('2026-01-01T23:00:00Z'), 'Asia/Tokyo', '22:00', '07:00'), false);
  assert.equal(inQuietHours(at('2026-01-01T23:00:00Z'), 'UTC', '00:00', '00:00'), false);
});

// --- Engine against a real Postgres (skipped when DATABASE_URL is unreachable) ---
const db = new PrismaService();
const engine = new EngineService(db);
let dbUp = false;
let userId = '';
let acctId = '';

before(async () => {
  try {
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    return;
  }
  const email = `engine-test-${Date.now()}@test.local`;
  const user = await db.user.create({ data: { email } });
  userId = user.id;
  const acct = await db.igAccount.create({
    data: { userId, handle: 'sender', dailyLimit: 2, minDelaySec: 15, maxDelaySec: 15, quietStart: '00:00', quietEnd: '00:00' },
  });
  acctId = acct.id;
  const tpl = await db.template.create({ data: { userId, name: 't', body: 'hi {{name}}' } });
  const leads = await Promise.all(['a', 'b', 'c'].map((h) => db.lead.create({ data: { userId, handle: `lead_${h}`, name: h } })));
  await db.campaign.create({
    data: {
      userId,
      igAccountId: acct.id,
      name: 'c',
      status: 'Active',
      jobs: { createMany: { data: leads.map((l) => ({ leadId: l.id, templateId: tpl.id, renderedText: `hi ${l.name}` })) } },
    },
  });
});

after(async () => {
  if (dbUp) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test('claim: one at a time, pacing, wrong account, daily cap', async (t) => {
  if (!dbUp) return t.skip('database not reachable');

  // Concurrent claims on one account: exactly one gets a job.
  const [r1, r2] = await Promise.all([engine.claim(userId, acctId, '111'), engine.claim(userId, acctId, '111')]);
  const got = [r1, r2].filter((r) => 'job' in r);
  assert.equal(got.length, 1);
  assert.equal([r1, r2].find((r) => 'wait' in r && r.wait === 'BUSY') !== undefined, true);

  const job1 = (got[0] as { job: { id: string } }).job;
  assert.deepEqual(await engine.result(userId, job1.id, { ok: true }), { ignored: false, paused: false, pausedReason: null });

  // Pacing: next send must wait min delay.
  const paced = await engine.claim(userId, acctId, '111');
  assert.ok('wait' in paced && paced.wait === 'PACING');

  // Wrong browser login is refused (igUserId was not bound by heartbeat in this test, so bind it now).
  await db.igAccount.update({ where: { id: acctId }, data: { igUserId: '111', nextSendAt: null } });
  const wrong = await engine.claim(userId, acctId, '999');
  assert.ok('wait' in wrong && wrong.wait === 'WRONG_ACCOUNT');

  const r3 = await engine.claim(userId, acctId, '111');
  assert.ok('job' in r3);
  await engine.result(userId, r3.job.id, { ok: true });
  await db.igAccount.update({ where: { id: acctId }, data: { nextSendAt: null } });

  const capped = await engine.claim(userId, acctId, '111');
  assert.ok('wait' in capped && capped.wait === 'DAILY_LIMIT');

  const lead = await db.lead.findFirstOrThrow({ where: { userId, handle: 'lead_a' } });
  assert.equal(lead.status, 'Contacted');
});

test('blocking error pauses the account and requeues the job', async (t) => {
  if (!dbUp) return t.skip('database not reachable');
  await db.igAccount.update({ where: { id: acctId }, data: { dailyLimit: 100, nextSendAt: null } });
  const r = await engine.claim(userId, acctId, '111');
  assert.ok('job' in r);
  const res = await engine.result(userId, r.job.id, { ok: false, error: 'ACTION_BLOCKED' });
  assert.equal(res.paused, true);
  const job = await db.sendJob.findUniqueOrThrow({ where: { id: r.job.id } });
  assert.equal(job.state, 'Queued');
  const after = await engine.claim(userId, acctId, '111');
  assert.ok('wait' in after && after.wait === 'PAUSED');
});

test('quiet hours use the lead timezone', async (t) => {
  if (!dbUp) return t.skip('database not reachable');
  await db.igAccount.update({ where: { id: acctId }, data: { pausedReason: null, quietStart: '00:00', quietEnd: '23:59' } });
  const quiet = await engine.claim(userId, acctId, '111');
  assert.ok('wait' in quiet && quiet.wait === 'QUIET_HOURS');
});

test('follow-ups wait for their delay and stop when the lead replies', async (t) => {
  if (!dbUp) return t.skip('database not reachable');
  await db.igAccount.update({ where: { id: acctId }, data: { pausedReason: null, quietStart: '00:00', quietEnd: '00:00', nextSendAt: null, dailyLimit: 100 } });
  await db.campaign.updateMany({ where: { userId }, data: { status: 'Paused' } });
  const tpl = await db.template.create({ data: { userId, name: 'f', body: 'following up {{name}}' } });
  const [x, y] = await Promise.all(['x', 'y'].map((h) => db.lead.create({ data: { userId, handle: `fu_${h}`, name: h } })));
  const c = await db.campaign.create({
    data: {
      userId,
      igAccountId: acctId,
      name: 'seq',
      status: 'Active',
      steps: { create: [{ position: 1, delayDays: 2, templateId: tpl.id }] },
      jobs: { createMany: { data: [x, y].map((l) => ({ leadId: l.id, templateId: tpl.id, renderedText: `hi ${l.name}` })) } },
    },
  });
  const sendNext = async (now: Date) => {
    await db.igAccount.update({ where: { id: acctId }, data: { nextSendAt: null } });
    const r = await engine.claim(userId, acctId, '111', now);
    if ('job' in r) await engine.result(userId, r.job.id, { ok: true });
    return r;
  };
  const now = new Date();
  await sendNext(now);
  await sendNext(now);
  const followUps = await db.sendJob.findMany({ where: { campaignId: c.id, step: 1 } });
  assert.equal(followUps.length, 2);
  assert.equal(followUps[0].renderedText.startsWith('following up'), true);

  // Not due yet.
  const early = await sendNext(new Date(now.getTime() + 60_000));
  assert.ok('wait' in early && early.wait === 'QUEUE_EMPTY');

  // x replied: only y's follow-up goes out, then the campaign completes.
  await db.lead.update({ where: { id: x.id }, data: { status: 'Replied' } });
  const later = new Date(now.getTime() + 3 * 24 * 3600_000);
  const r = await sendNext(later);
  assert.ok('job' in r && r.job.handle === 'fu_y');
  const again = await sendNext(later);
  assert.ok('wait' in again && again.wait === 'QUEUE_EMPTY');
});
