const PATTERNS: [RegExp, string][] = [
  [/HTTP 403|Forbidden|Insufficient role|insufficient_role|not authorized|not have permission/i,
    'ليس لديك صلاحية لتنفيذ هذا الإجراء'],
  [/HTTP 401|Unauthorized|Session expired|jwt|token expired/i,
    'انتهت صلاحية تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى'],
  [/HTTP 404|not found|Not Found/i,
    'العنصر المطلوب غير موجود'],
  [/HTTP 409|Conflict|already exists|duplicate|unique constraint/i,
    'البيانات موجودة مسبقاً'],
  [/HTTP 422|HTTP 400|Validation|validation failed|invalid|must be|should be|required/i,
    'يرجى التحقق من البيانات المدخلة'],
  [/HTTP 5\d\d|Internal Server Error|Internal server/i,
    'حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً'],
  [/Failed to fetch|fetch|ECONNREFUSED|NetworkError|network error/i,
    'تعذر الاتصال بالخادم'],
];

export function translateError(err: unknown, fallback?: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');

  // Already Arabic — return as-is
  if (/[؀-ۿ]/.test(msg)) return msg;

  for (const [pattern, arabic] of PATTERNS) {
    if (pattern.test(msg)) return arabic;
  }

  return fallback ?? 'حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً';
}

export const MSG = {
  NO_PERM:         'ليس لديك صلاحية لتنفيذ هذا الإجراء',
  NO_PERM_COST:    'لا يمكنك تعديل تكلفة المنتج.\nيرجى التواصل مع مسؤول الحساب إذا كنت تحتاج هذه الصلاحية.',
  SAVE_OK:         'تم الحفظ بنجاح',
  DELETE_OK:       'تم الحذف بنجاح',
  SAVE_FAIL:       'لا يمكن تنفيذ العملية حالياً',
  LOAD_FAIL:       'فشل تحميل البيانات',
} as const;
