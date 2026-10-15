import { Body, ConflictException, Controller, Get, HttpException, Post, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { Auth, parse, UserId } from './http';
import { hashPassword, verifyPassword } from './password';
import { PrismaService } from './prisma.service';

export const Email = z.string().trim().toLowerCase().email().max(200);
export const Password = z.string().min(8, 'Password must be at least 8 characters').max(200);

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
// ponytail: in-memory, per API process. Move to Postgres/Redis when the API runs as more than one instance.
const failures = new Map<string, { count: number; first: number }>();

const publicUser = (u: { id: string; email: string; name: string | null; role: string; passwordHash?: string | null }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  hasPassword: !!u.passwordHash,
});

/** Endpoints the Next.js server calls on its own behalf (service token) during sign-in and first-run setup. */
@Controller()
export class AuthController {
  constructor(private db: PrismaService) {}

  /** Setup is needed while no admin exists (a fresh database, or one with only pre-roles users). */
  @Get('auth/setup')
  @Auth('service')
  async setupStatus() {
    return { needed: !(await this.db.user.count({ where: { role: 'Admin' } })) };
  }

  @Post('auth/setup')
  @Auth('service')
  async setup(@Body() body: unknown) {
    const { email, name, password } = parse(z.object({ email: Email, name: z.string().trim().max(100).optional(), password: Password }), body);
    const passwordHash = await hashPassword(password);
    return this.db.$transaction(async (tx) => {
      // Serialises concurrent setup requests so only one can create the first admin.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724001)`;
      if (await tx.user.count({ where: { role: 'Admin' } })) throw new ConflictException('Setup is already complete');
      const user = await tx.user.upsert({
        where: { email },
        update: { role: 'Admin', passwordHash, ...(name && { name }) },
        create: { email, name: name || null, role: 'Admin', passwordHash },
      });
      return publicUser(user);
    });
  }

  @Post('auth/verify')
  @Auth('service')
  async verify(@Body() body: unknown) {
    const { email, password } = parse(z.object({ email: Email, password: z.string().max(200) }), body);
    const f = failures.get(email);
    if (f && Date.now() - f.first > LOCKOUT_MS) failures.delete(email);
    if ((failures.get(email)?.count ?? 0) >= MAX_FAILURES) throw new HttpException('Too many attempts. Try again in 15 minutes.', 429);

    const user = await this.db.user.findUnique({ where: { email } });
    if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
      const cur = failures.get(email) ?? { count: 0, first: Date.now() };
      failures.set(email, { ...cur, count: cur.count + 1 });
      throw new UnauthorizedException('Wrong email or password');
    }
    failures.delete(email);
    return publicUser(user);
  }

  /** Google sign-in is allowed only for emails an admin has added. */
  @Post('auth/allowed')
  @Auth('service')
  async allowed(@Body() body: unknown) {
    const { email } = parse(z.object({ email: Email }), body);
    return { allowed: !!(await this.db.user.findUnique({ where: { email }, select: { id: true } })) };
  }

  @Get('me')
  async me(@UserId() userId: string) {
    return publicUser(await this.db.user.findUniqueOrThrow({ where: { id: userId } }));
  }
}

export { publicUser };
