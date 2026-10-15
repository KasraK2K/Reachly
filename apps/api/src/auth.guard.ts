import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { jwtVerify } from 'jose';
import { PrismaService } from './prisma.service';
import { AUTH_KIND, AuthKind } from './http';

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * 'user'      — short-lived HS256 JWT minted by the Next.js BFF for a signed-in user. The user must exist:
 *               accounts are only created by first-run setup or by an admin (no self sign-up).
 * 'admin'     — same, and the user's role must be Admin.
 * 'service'   — JWT minted by the Next.js server itself (sign-in checks, first-run setup); never reaches browsers.
 * 'extension' — opaque bearer token issued via POST /extension/tokens (only its hash is stored).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private secret = new TextEncoder().encode(process.env.INTERNAL_JWT_SECRET);

  constructor(
    private db: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.getAllAndOverride<AuthKind>(AUTH_KIND, [ctx.getHandler(), ctx.getClass()]) ?? 'user';
    if (kind === 'public') return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException();

    if (kind === 'extension') {
      const row = await this.db.extensionToken.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!row) throw new UnauthorizedException('Extension token invalid — reconnect the extension');
      req.userId = row.userId;
      return true;
    }

    const payload = await jwtVerify(token, this.secret, { issuer: 'reachly-web', audience: 'reachly-api' })
      .then((r) => r.payload)
      .catch(() => {
        throw new UnauthorizedException();
      });
    if (kind === 'service') {
      if (payload.svc !== true) throw new UnauthorizedException();
      return true;
    }

    const email = String(payload.email ?? '').toLowerCase();
    // Looked up on every request, so removing a user or changing their role takes effect immediately.
    const user = email && payload.svc !== true ? await this.db.user.findUnique({ where: { email } }) : null;
    if (!user) throw new UnauthorizedException('No account for this email');
    if (kind === 'admin' && user.role !== 'Admin') throw new ForbiddenException('Admins only');
    req.userId = user.id;
    return true;
  }
}
