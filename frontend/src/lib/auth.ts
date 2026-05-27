import Cookies from 'js-cookie';
import type { User } from './types';

export function saveTokens(accessToken: string, refreshToken: string) {
  Cookies.set('token', accessToken, { expires: 1, sameSite: 'lax' });
  Cookies.set('refreshToken', refreshToken, { expires: 7, sameSite: 'lax' });
}

export function clearTokens() {
  Cookies.remove('token');
  Cookies.remove('refreshToken');
  Cookies.remove('user');
}

export function saveUser(user: User) {
  Cookies.set('user', JSON.stringify(user), { expires: 1, sameSite: 'lax' });
}

export function getUser(): User | null {
  try {
    const raw = Cookies.get('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

export function isSuperAdmin(user: User | null): boolean {
  return user?.role === 'super_admin';
}
