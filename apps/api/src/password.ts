import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Format: scrypt$<salt hex>$<hash hex>. Node's scrypt defaults (N=16384, r=8, p=1). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  const [algo, salt, hash] = (stored ?? '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) {
    await scryptAsync(pw, randomBytes(16), 64); // same timing whether or not the user has a password
    return false;
  }
  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(await scryptAsync(pw, Buffer.from(salt, 'hex'), 64), expected);
}
