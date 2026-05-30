import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS        = ['/', '/login'];
const CHANGE_PASSWORD_PATH = '/change-password';

export function middleware(req: NextRequest) {
  const token    = req.cookies.get('token')?.value;
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)));

  // Unauthenticated → login
  if (!token && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated on public page → dashboard
  if (token && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Authenticated: enforce mustChangePassword
  if (token && pathname !== CHANGE_PASSWORD_PATH) {
    try {
      const raw = req.cookies.get('user')?.value;
      if (raw) {
        const user = JSON.parse(raw);
        if (user?.mustChangePassword === true) {
          const url = req.nextUrl.clone();
          url.pathname = CHANGE_PASSWORD_PATH;
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // Malformed cookie — let request through; login will fix it
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
