import { BadRequestException, createParamDecorator, ExecutionContext, NotFoundException, SetMetadata } from '@nestjs/common';
import { z } from 'zod';

/** Parses input with a zod schema, turning failures into a 400 with readable messages. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  return r.data;
}

export function found<T>(v: T | null | undefined, what = 'Resource'): T {
  if (v == null) throw new NotFoundException(`${what} not found`);
  return v;
}

export type AuthKind = 'user' | 'admin' | 'service' | 'extension' | 'public';
export const AUTH_KIND = 'authKind';
/** Default is 'user' (BFF-signed JWT). */
export const Auth = (kind: AuthKind) => SetMetadata(AUTH_KIND, kind);

export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().userId);
