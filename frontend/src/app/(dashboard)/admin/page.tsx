'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { admin as api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

interface UserRow { id: number; username: string; fullName: string | null; role: string; isActive: boolean; lastLogin: string | null }

export default function AdminPage() {
  const [users, setUsers]     = useState<UserRow[]>([]);
  const [counts, setCounts]   = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    Promise.all([
      api.users() as Promise<UserRow[]>,
      api.performance(),
    ])
      .then(([u, p]) => { setUsers(u); setCounts(p.counts); })
      .catch(err => setError(err instanceof Error ? err.message : 'فشل تحميل بيانات الإدارة'))
      .finally(() => setLoading(false));
  }, []);

  const ROLE_LABELS: Record<string, string> = {
    super_admin: 'مشرف عام',
    admin:       'مدير',
    user:        'مستخدم',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">الإدارة</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {counts && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">إحصائيات النظام</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(counts).map(([key, val]) => (
              <div key={key} className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{val.toLocaleString('ar-SA')}</p>
                <p className="text-xs text-slate-500 mt-0.5">{key}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">المستخدمون</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['اسم المستخدم', 'الاسم الكامل', 'الدور', 'الحالة', 'آخر دخول'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center py-8 text-slate-400">جارٍ التحميل…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center py-8 text-slate-400">لا توجد مستخدمون</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="table-td font-mono text-xs">{u.username}</td>
                  <td className="table-td">{u.fullName ?? '—'}</td>
                  <td className="table-td">
                    <Badge label={ROLE_LABELS[u.role] ?? u.role} variant={u.role === 'super_admin' ? 'red' : u.role === 'admin' ? 'blue' : 'slate'} />
                  </td>
                  <td className="table-td">
                    <Badge label={u.isActive ? 'نشط' : 'معطل'} variant={u.isActive ? 'green' : 'slate'} />
                  </td>
                  <td className="table-td text-slate-400 text-xs">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString('ar-SA') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
