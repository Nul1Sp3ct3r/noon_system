'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, isPlatformAdmin } from '@/lib/auth';
import { ShieldAlert } from 'lucide-react';

export function PlatformAdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user   = getUser();
  const ok     = isPlatformAdmin(user);

  useEffect(() => {
    if (!ok) router.replace('/dashboard');
  }, [ok, router]);

  if (!ok) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-slate-400">
        <ShieldAlert size={40} className="text-red-400" />
        <p className="text-lg font-medium">403 — غير مصرح</p>
        <p className="text-sm">هذه الصفحة مخصصة لمدير المنصة فقط</p>
      </div>
    );
  }

  return <>{children}</>;
}
