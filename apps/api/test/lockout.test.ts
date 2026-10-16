import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { AuthController } from '../src/auth.controller';
import { PrismaService } from '../src/prisma.service';

const db = new PrismaService();
const email = `lockout-${Date.now()}@test.local`;
after(async () => {
  await db.loginFailure.deleteMany({ where: { email } }).catch(() => {});
  await db.$disconnect();
});

test('five wrong passwords lock the email, in the database', async (t) => {
  if (!(await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false))) return t.skip('database not reachable');
  const auth = new AuthController(db);
  const status = (p: Promise<unknown>) => p.then(() => 200, (e: { getStatus: () => number }) => e.getStatus());
  for (let i = 0; i < 5; i++) assert.equal(await status(auth.verify({ email, password: 'wrong' })), 401);
  assert.equal(await status(auth.verify({ email, password: 'wrong' })), 429);
  // An expired window starts over.
  await db.loginFailure.update({ where: { email }, data: { firstAt: new Date(Date.now() - 16 * 60_000) } });
  assert.equal(await status(auth.verify({ email, password: 'wrong' })), 401);
  assert.equal((await db.loginFailure.findUniqueOrThrow({ where: { email } })).count, 1);
});
