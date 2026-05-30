'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';
import { saveTokens, saveUser, getUser } from '@/lib/auth';
import { ShieldCheck, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ChangePasswordPage() {
  const router  = useRouter();
  const user    = getUser();
  const forced  = user?.mustChangePassword === true;

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNew,    setShowNew]    = useState(false);
  const [showConfirm,setShowConfirm]= useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState(false);

  // Password strength indicator
  const strength = (() => {
    if (!newPwd) return 0;
    let s = 0;
    if (newPwd.length >= 8)               s++;
    if (/[A-Z]/.test(newPwd))             s++;
    if (/[0-9]/.test(newPwd))             s++;
    if (/[^A-Za-z0-9]/.test(newPwd))     s++;
    return s;
  })();

  const strengthLabel = ['', 'ضعيفة', 'مقبولة', 'جيدة', 'قوية'][strength];
  const strengthColor = ['', 'bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500'][strength];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setError('كلمة المرور الجديدة وتأكيدها غير متطابقتين');
      return;
    }
    if (newPwd.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await auth.changePassword({
        newPassword:     newPwd,
        confirmPassword: confirmPwd,
        currentPassword: forced ? undefined : currentPwd || undefined,
      });

      saveTokens(result.accessToken, result.refreshToken);
      saveUser(result.user);
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تغيير كلمة المرور');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-slate-800 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">

        {/* Icon */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-100 mb-4">
            <ShieldCheck size={26} className="text-brand-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {forced ? 'تغيير كلمة المرور المؤقتة' : 'تغيير كلمة المرور'}
          </h1>
          {forced && (
            <p className="text-sm text-amber-600 mt-1 bg-amber-50 rounded-lg px-3 py-1.5">
              يجب تغيير كلمة المرور قبل الاستمرار
            </p>
          )}
        </div>

        {success ? (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
            <p className="font-medium text-slate-800">تم تغيير كلمة المرور بنجاح</p>
            <p className="text-sm text-slate-500 mt-1">جارٍ التحويل…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Current password — only for voluntary change */}
            {!forced && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  كلمة المرور الحالية
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="أدخل كلمة المرور الحالية"
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  required={!forced}
                />
              </div>
            )}

            {/* New password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                كلمة المرور الجديدة
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  className="input pl-10"
                  placeholder="8 أحرف على الأقل"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowNew(v => !v)}
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Strength bar */}
              {newPwd && (
                <div className="mt-2">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">قوة: {strengthLabel}</p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="input pl-10"
                  placeholder="أعد كتابة كلمة المرور الجديدة"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowConfirm(v => !v)}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirmPwd && newPwd !== confirmPwd && (
                <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}
            </button>

          </form>
        )}
      </div>
    </div>
  );
}
