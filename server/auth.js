import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [algorithm, salt, hex] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function sessionToken(req) {
  return /(?:^|;\s*)agd_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
}
export function sessionCookie(token, secure = false) {
  return `agd_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`;
}
export function validateCredentials({ email, password }) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) throw Object.assign(new Error('Password must contain 8–256 characters.'), { status: 400 });
  return email.trim().toLowerCase();
}
