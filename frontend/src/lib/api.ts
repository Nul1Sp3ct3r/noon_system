import Cookies from 'js-cookie';
import type { AuthTokens, PaginatedResponse, Product, Order, Invoice, InvoiceDetail, InvoiceItem, InventoryStock, InventoryStockDetail, InventoryDashboard, InventoryMovement, Warehouse, PlRow, VatRow, ProfitabilityRow, ProfitabilityResponse, SettlementRow, ImportBatch, ImportResult, NoonStatementSummary, SalesRow, FeesRow, FeesResponse, ReconciliationReport, JournalEntry, Account, AccountingPeriod, JournalTemplate, TrialBalance, GeneralLedger, Expense, ExpenseCategory, ExpenseStats, Merchant, MerchantDetail, MerchantUser, Plan, MerchantSubscription, PlatformPayment, PlatformKpis, CompanySettings, StatementRow, StatementKpis, StatementDetail, ProductFamily, ProductFamilyDetail, FamilySuggestion, FinancialSummary, MonthlyFinancialSummary, ReconciliationResult, PeriodFilter, PriceUpdatePreview, PriceUpdateResult, PurchaseKpis } from './types';
import { translateError } from './errors';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

function extractMsg(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const b = body as Record<string, unknown>;
  const m = b.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.map(String).join(', ');
  if (m && typeof m === 'object') {
    const inner = (m as Record<string, unknown>).message;
    if (typeof inner === 'string') return inner;
    if (Array.isArray(inner)) return inner.map(String).join(', ');
  }
  return fallback;
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = Cookies.get('token');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم');
  }

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) return http<T>(path, init);
    Cookies.remove('token');
    Cookies.remove('refreshToken');
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('انتهت صلاحية تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const raw = extractMsg(body, `HTTP ${res.status}`);
    throw new Error(translateError(raw));
  }

  // 204 no content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const refreshToken = Cookies.get('refreshToken');
    if (!refreshToken) return false;
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    Cookies.set('token', data.accessToken, { expires: 1 });
    return true;
  } catch {
    return false;
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const auth = {
  login: (username: string, password: string) =>
    http<AuthTokens>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    http<void>('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined),

  changePassword: (dto: { newPassword: string; confirmPassword: string; currentPassword?: string }) =>
    http<AuthTokens>('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify(dto) }),
};

// ── Products ───────────────────────────────────────────────────────────────────

export const products = {
  list: (params?: { q?: string; page?: number; limit?: number }) =>
    http<PaginatedResponse<Product>>(`/api/v1/products?${qs(params)}`),

  get: (id: number) => http<Product>(`/api/v1/products/${id}`),

  create: (dto: Partial<Product>) =>
    http<Product>('/api/v1/products', { method: 'POST', body: JSON.stringify(dto) }),

  update: (id: number, dto: Partial<Product>) =>
    http<Product>(`/api/v1/products/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  remove: (id: number) =>
    http<{ deleted: boolean }>(`/api/v1/products/${id}`, { method: 'DELETE' }),
};

// ── Orders ─────────────────────────────────────────────────────────────────────

export const orders = {
  list: (params?: { q?: string; page?: number; limit?: number; status?: string }) =>
    http<PaginatedResponse<Order>>(`/api/v1/orders?${qs(params)}`),
};

// ── Invoices ───────────────────────────────────────────────────────────────────

export const invoices = {
  kpis: () => http<PurchaseKpis>('/api/v1/invoices/kpis'),

  list: (params?: { page?: number; limit?: number; status?: string; q?: string; from?: string; to?: string }) =>
    http<PaginatedResponse<Invoice>>(`/api/v1/invoices?${qs(params)}`),

  get: (id: number) => http<InvoiceDetail>(`/api/v1/invoices/${id}`),

  create: (dto: object) =>
    http<InvoiceDetail>('/api/v1/invoices', { method: 'POST', body: JSON.stringify(dto) }),

  update: (id: number, dto: object) =>
    http<Invoice>(`/api/v1/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  voidInvoice: (id: number, reason?: string) =>
    http<Invoice>(`/api/v1/invoices/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),

  remove: (id: number) =>
    http<{ deleted: boolean }>(`/api/v1/invoices/${id}`, { method: 'DELETE' }),

  addItem: (id: number, dto: object) =>
    http<InvoiceDetail>(`/api/v1/invoices/${id}/items`, { method: 'POST', body: JSON.stringify(dto) }),

  removeItem: (id: number, itemId: number) =>
    http<InvoiceDetail>(`/api/v1/invoices/${id}/items/${itemId}`, { method: 'DELETE' }),

  uploadPdf: (id: number, file: File): Promise<{ uploaded: boolean; filename: string }> => {
    const token = Cookies.get('token');
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/api/v1/invoices/${id}/upload-pdf`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(extractMsg(b, `HTTP ${r.status}`)); }
      return r.json();
    });
  },

  downloadPdf: async (id: number, filename: string): Promise<void> => {
    const token = Cookies.get('token');
    const res = await fetch(`${BASE}/api/v1/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  deletePdf: (id: number) =>
    http<{ deleted: boolean }>(`/api/v1/invoices/${id}/pdf`, { method: 'DELETE' }),
};

// ── Inventory ──────────────────────────────────────────────────────────────────

export const inventory = {
  stock: (warehouseId?: number) =>
    http<InventoryStock[]>(`/api/v1/inventory/stock${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),

  stockEnriched: (params?: {
    q?: string; warehouseId?: number; stockStatus?: string;
    missingCost?: boolean; staleStock?: boolean; negativeMargin?: boolean;
    page?: number; limit?: number;
  }) =>
    http<PaginatedResponse<InventoryStockDetail>>(`/api/v1/inventory/stock-enriched?${qs(params)}`),

  dashboard: () => http<InventoryDashboard>('/api/v1/inventory/dashboard'),

  warehouses: () => http<Warehouse[]>('/api/v1/inventory/warehouses'),

  movements: (params?: { q?: string; sku?: string; warehouseId?: number; movementType?: string; referenceType?: string; reasonCode?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    http<PaginatedResponse<InventoryMovement>>(`/api/v1/inventory/movements?${qs(params)}`),

  createMovement: (dto: object) =>
    http<InventoryMovement>('/api/v1/inventory/movements', { method: 'POST', body: JSON.stringify(dto) }),

  adjustStock: (dto: { sku: string; warehouseId?: number; newQty: number; reason: string }) =>
    http<{ adjusted: boolean; previousQty: number; newQty: number; diff: number; reference?: string }>
      ('/api/v1/inventory/adjust', { method: 'POST', body: JSON.stringify(dto) }),
};

// ── Reports ────────────────────────────────────────────────────────────────────

export const reports = {
  pl:        (period?: Partial<PeriodFilter>) =>
    http<PlRow[]>(`/api/v1/reports/pl?${qs(period)}`),
  sales:     (params?: { startDate?: string; endDate?: string; brand?: string; sortBy?: string; status?: string }) =>
    http<SalesRow[]>(`/api/v1/reports/sales?${qs(params)}`),
  fees:      (params?: { startDate?: string; endDate?: string; brand?: string }) =>
    http<FeesResponse>(`/api/v1/reports/fees?${qs(params)}`),
  inventory: ()                => http<InventoryStock[]>('/api/v1/reports/inventory'),
  invoices:  (year?: number)   => http<unknown>(`/api/v1/reports/invoices?${qs({ year })}`),
};

// ── VAT Center ─────────────────────────────────────────────────────────────────

export const vatCenter = {
  breakdown: (period?: Partial<PeriodFilter>) =>
    http<{ months: VatRow[] }>(`/api/v1/vat-center?${qs(period)}`),
};

// ── Profitability ──────────────────────────────────────────────────────────────

export const profitability = {
  list: (params?: Partial<PeriodFilter> & { brand?: string; sku?: string; badge?: string }) =>
    http<ProfitabilityResponse>(`/api/v1/profitability?${qs(params)}`),
};

// ── Settlements ────────────────────────────────────────────────────────────────

export const settlements = {
  list: (params?: { page?: number; limit?: number }) =>
    http<PaginatedResponse<SettlementRow>>(`/api/v1/settlements?${qs(params)}`),
};

// ── Imports ────────────────────────────────────────────────────────────────────

export const imports = {
  upload: (
    file: File,
    importType?: string,
    onProgress?: (pct: number) => void,
  ): Promise<ImportResult> => {
    return new Promise((resolve, reject) => {
      const token = Cookies.get('token');
      const fd = new FormData();
      fd.append('file', file);
      const url = importType
        ? `${BASE}/api/v1/imports/upload?importType=${encodeURIComponent(importType)}`
        : `${BASE}/api/v1/imports/upload`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.timeout = 120_000; // 2 minutes — Vercel function max is 30s but give upload buffer
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('استجابة غير صالحة من الخادم')); }
        } else {
          // Always try to extract the real backend error message
          let msg = `خطأ HTTP ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText);
            msg = extractMsg(body, msg);
          } catch { /* keep default msg */ }
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => {
        // Network-level failure (CORS, connection reset, Vercel timeout dropping connection).
        // The server may have returned a body before the connection dropped — try to read it.
        let msg = 'فشل الاتصال بالخادم — قد يكون الملف كبيراً جداً أو انتهت مهلة الخادم. أعد المحاولة.';
        try {
          const body = JSON.parse(xhr.responseText);
          const serverMsg = extractMsg(body, '');
          if (serverMsg) msg = serverMsg;
        } catch { /* keep default msg */ }
        reject(new Error(msg));
      };

      xhr.ontimeout = () => {
        reject(new Error('انتهت مهلة رفع الملف — الملف كبير جداً أو الشبكة بطيئة. أعد المحاولة.'));
      };

      xhr.send(fd);
    });
  },

  listBatches: (params?: { page?: number; limit?: number }) =>
    http<PaginatedResponse<ImportBatch>>(`/api/v1/imports/batches?${qs(params)}`),

  deleteBatch: (batchId: string) =>
    http<{ deleted: boolean }>(`/api/v1/imports/batches/${batchId}`, { method: 'DELETE' }),

  reconciliation: (batchId: string) =>
    http<ReconciliationReport>(`/api/v1/imports/batches/${batchId}/reconciliation`),

  statementSummaries: (batchId: string) =>
    http<{ batchId: string; fileName: string | null; importedAt: string; statements: NoonStatementSummary[] }>(
      `/api/v1/imports/batches/${batchId}/statements`,
    ),

  priceUpdatePreview: (
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<PriceUpdatePreview> =>
    new Promise((resolve, reject) => {
      const token = Cookies.get('token');
      const fd  = new FormData();
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/api/v1/imports/price-update/preview`);
      xhr.timeout = 60_000;
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('استجابة غير صالحة من الخادم')); }
        } else {
          let msg = `خطأ HTTP ${xhr.status}`;
          try { const b = JSON.parse(xhr.responseText); msg = extractMsg(b, msg); } catch { /* keep default */ }
          reject(new Error(msg));
        }
      };
      xhr.onerror   = () => reject(new Error('فشل الاتصال بالخادم'));
      xhr.ontimeout = () => reject(new Error('انتهت مهلة رفع الملف'));
      xhr.send(fd);
    }),

  priceUpdateApply: (
    rows: { productId: number; sku: string; partnerSku?: string | null; newCost: number }[],
    costIncludesVat: boolean,
    fileName?: string,
  ): Promise<PriceUpdateResult> =>
    http<PriceUpdateResult>('/api/v1/imports/price-update/apply', {
      method: 'POST',
      body:   JSON.stringify({ rows, costIncludesVat, fileName }),
    }),

  priceUpdateBatch: (batchId: string) =>
    http<{ batchId: string; fileName: string | null; importedAt: string; updatedCount: number; rows: { id: number; sku: string; partnerSku: string | null; oldCost: number | null; newCost: number; costIncludesVat: boolean; createdAt: string }[] }>(
      `/api/v1/imports/price-update/batches/${batchId}`,
    ),
};

// ── Statements ────────────────────────────────────────────────────────────────

export const statements = {
  kpis: (period?: Partial<PeriodFilter>) =>
    http<StatementKpis>(`/api/v1/statements/kpis?${qs(period)}`),

  list: (filters?: Partial<PeriodFilter> & { status?: string; search?: string }) =>
    http<{ statements: StatementRow[]; vatRegistered: boolean }>(
      `/api/v1/statements?${qs(filters)}`,
    ),

  detail: (referenceNr: string) =>
    http<StatementDetail>(`/api/v1/statements/${encodeURIComponent(referenceNr)}`),
};

// ── Exports (inventory-stock is a direct endpoint, not generic /exports/:type) ─

export async function downloadInventoryExport(): Promise<void> {
  const token = Cookies.get('token');
  const res = await fetch(`${BASE}/api/v1/exports/inventory-stock`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'inventory_stock.xlsx';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Journals ───────────────────────────────────────────────────────────────────

export const journals = {
  list: (params?: { q?: string; from?: string; to?: string; status?: string; accountId?: number; page?: number; limit?: number }) =>
    http<PaginatedResponse<JournalEntry>>(`/api/v1/journals?${qs(params)}`),

  stats: () =>
    http<{ total: number; todayCount: number; posted: number; draft: number; totalDebit: number; totalCredit: number }>('/api/v1/journals/stats'),

  get: (id: number) => http<JournalEntry>(`/api/v1/journals/${id}`),

  create: (dto: object) =>
    http<JournalEntry>('/api/v1/journals', { method: 'POST', body: JSON.stringify(dto) }),

  post: (id: number) =>
    http<JournalEntry>(`/api/v1/journals/${id}/post`, { method: 'POST' }),

  reverse: (id: number) =>
    http<JournalEntry>(`/api/v1/journals/${id}/reverse`, { method: 'POST' }),

  remove: (id: number) =>
    http<{ deleted: boolean }>(`/api/v1/journals/${id}`, { method: 'DELETE' }),
};

// ── Accounts ──────────────────────────────────────────────────────────────────

export const accounts = {
  list: (params?: { q?: string; type?: string; activeOnly?: boolean }) =>
    http<Account[]>(`/api/v1/accounts?${qs(params)}`),

  get: (id: number) => http<Account>(`/api/v1/accounts/${id}`),

  create: (dto: object) =>
    http<Account>('/api/v1/accounts', { method: 'POST', body: JSON.stringify(dto) }),

  update: (id: number, dto: object) =>
    http<Account>(`/api/v1/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  seedDefaults: () =>
    http<{ seeded: boolean; count?: number; message?: string }>('/api/v1/accounts/seed-defaults', { method: 'POST' }),
};

// ── Accounting ────────────────────────────────────────────────────────────────

export const accounting = {
  trialBalance: (params?: { from?: string; to?: string }) =>
    http<TrialBalance>(`/api/v1/accounting/trial-balance?${qs(params)}`),

  ledger: (accountId: number, params?: { from?: string; to?: string }) =>
    http<GeneralLedger>(`/api/v1/accounting/ledger/${accountId}?${qs(params)}`),

  periods: () =>
    http<AccountingPeriod[]>('/api/v1/accounting/periods'),

  togglePeriod: (year: number, month: number, close: boolean) =>
    http<AccountingPeriod>('/api/v1/accounting/periods/toggle', {
      method: 'POST',
      body: JSON.stringify({ year, month, close }),
    }),

  templates: () =>
    http<JournalTemplate[]>('/api/v1/accounting/templates'),

  seedTemplates: () =>
    http<{ seeded: boolean; count?: number }>('/api/v1/accounting/templates/seed', { method: 'POST' }),
};

// ── Calculator ────────────────────────────────────────────────────────────────

export interface CalcResult {
  costExclVat: number;
  fixedFeesExcl: number;
  commissionAmount: number;
  feesTotalExcl: number;
  inputVatNoon: number;
  sellingExclVat: number;
  sellingInclVat: number;
  outputVat: number;
  netProfit: number;
  actualMarginPct: number;
}

export const calculator = {
  calculate: (body: object) =>
    http<CalcResult>('/api/v1/calculator/calculate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ── Organizations / Settings ──────────────────────────────────────────────────

export const orgSettings = {
  get: () => http<CompanySettings>('/api/v1/organizations/settings'),
  update: (dto: Partial<CompanySettings>) =>
    http<CompanySettings>('/api/v1/organizations/settings', {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),
};

// ── Financial Engine ──────────────────────────────────────────────────────────
// Single source of truth for all financial metrics. All pages should use these
// endpoints instead of calculating independently.

export const financial = {
  summary: (period?: Partial<PeriodFilter>) =>
    http<FinancialSummary>(`/api/v1/financial/summary?${qs(period)}`),

  monthly: (period?: Partial<PeriodFilter>) =>
    http<MonthlyFinancialSummary[]>(`/api/v1/financial/monthly?${qs(period)}`),

  reconcile: (year?: number) =>
    http<ReconciliationResult>(`/api/v1/financial/reconcile?${qs({ year })}`),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

type DashboardSummary = {
  revenue:           number;
  grossSales:        number;
  returns:           number;
  fees:              number;
  feesBeforeVat:     number;
  vatOnFees:         number;
  cogs:              number;
  netProfit:         number;
  operationalProfit: number;
  activeProfit:      number;
  marginPct:         number | null;
  deliveredCount:    number;
  returnedCount:     number;
  vatRegistered:     boolean;
  profitMode:        string;
  vatPayable:        number;
};

export const dashboard = {
  getData: (period?: Partial<PeriodFilter>) => http<{
    year:         number;
    period?:      string;
    summary:      DashboardSummary;
    dailyRevenue: { date: string; revenue: number }[];
    topProducts:  { sku: string | null; name: string | null; revenue: number }[];
    orderStatus:  { delivered: number; returned: number };
  }>(`/api/v1/reports/dashboard?${qs(period)}`),
};

// ── Admin ──────────────────────────────────────────────────────────────────────

export type AdminDashboard = {
  kpis: {
    monthlySales: number;
    netProfit: number;
    monthlyExpenses: number;
    orderCount: number;
    inventoryValue: number;
    vatPayable: number;
  };
  health: {
    failedImports: number;
    productsMissingCost: number;
    lowStock: number;
    outOfStock: number;
    draftJournals: number;
    draftExpenses: number;
  };
  trend: Array<{ month: string; sales: number; expenses: number; profit: number }>;
  expensesByCategory: Array<{ category: string; amount: number }>;
  recentActivities: Array<{
    id: number;
    action: string;
    entityType: string | null;
    entityId: number | null;
    createdAt: string;
    user: { id: number; username: string; fullName: string | null } | null;
  }>;
};

export const admin = {
  dashboard:    () => http<AdminDashboard>('/api/v1/admin/dashboard'),
  performance:  () => http<{ counts: Record<string, number> }>('/api/v1/admin/performance'),
  auditLogs:    (params?: object) => http<unknown>(`/api/v1/admin/audit-logs?${qs(params)}`),
  users:        () => http<unknown[]>('/api/v1/admin/users'),
  updateUser:   (id: number, dto: object) =>
    http<unknown>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
};

// ── Exports ───────────────────────────────────────────────────────────────────

export async function downloadExport(type: string, params?: object): Promise<void> {
  const token = Cookies.get('token');
  const queryStr = params
    ? '?' + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';

  const res = await fetch(`${BASE}/api/v1/exports/${type}${queryStr}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  a.download = match ? match[1] : `${type}_export.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Expenses ─────────────────────────────────────────────────────────────────

export const expenses = {
  list: (params?: { from?: string; to?: string; q?: string; vendor?: string; categoryId?: number; paymentMethod?: string; status?: string; amountMin?: number; amountMax?: number; page?: number; limit?: number }) =>
    http<PaginatedResponse<Expense>>(`/api/v1/expenses?${qs(params)}`),

  stats: (params?: { from?: string; to?: string }) =>
    http<ExpenseStats>(`/api/v1/expenses/stats?${qs(params)}`),

  get: (id: number) => http<Expense>(`/api/v1/expenses/${id}`),

  create: (dto: object) =>
    http<Expense>('/api/v1/expenses', { method: 'POST', body: JSON.stringify(dto) }),

  update: (id: number, dto: object) =>
    http<Expense>(`/api/v1/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  post: (id: number) =>
    http<Expense>(`/api/v1/expenses/${id}/post`, { method: 'POST' }),

  remove: (id: number) =>
    http<{ deleted: boolean }>(`/api/v1/expenses/${id}`, { method: 'DELETE' }),

  uploadAttachment: (id: number, file: File): Promise<{ uploaded: boolean; filename: string }> => {
    const token = Cookies.get('token');
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/api/v1/expenses/${id}/attachment`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(extractMsg(b, `HTTP ${r.status}`)); }
      return r.json();
    });
  },

  attachmentUrl: (id: number) => `${BASE}/api/v1/expenses/${id}/attachment`,

  deleteAttachment: (id: number) =>
    http<{ deleted: boolean }>(`/api/v1/expenses/${id}/attachment`, { method: 'DELETE' }),

  categories: () =>
    http<ExpenseCategory[]>('/api/v1/expenses/categories'),

  createCategory: (dto: object) =>
    http<ExpenseCategory>('/api/v1/expenses/categories', { method: 'POST', body: JSON.stringify(dto) }),

  seedCategories: () =>
    http<{ seeded: boolean; count?: number; message?: string }>('/api/v1/expenses/categories/seed', { method: 'POST' }),

  exportXlsx: async (params?: object): Promise<void> => {
    const token = Cookies.get('token');
    const res = await fetch(`${BASE}/api/v1/expenses/export?${qs(params)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'expenses.xlsx';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// ── Platform Admin ────────────────────────────────────────────────────────────

export const platformAdmin = {
  kpis: () =>
    http<PlatformKpis>('/api/v1/admin/platform-kpis'),

  // Merchants
  listMerchants: (params?: { q?: string; status?: string; page?: number; limit?: number }) =>
    http<PaginatedResponse<Merchant>>(`/api/v1/admin/merchants?${qs(params)}`),

  createMerchant: (dto: object) =>
    http<Merchant>('/api/v1/admin/merchants', { method: 'POST', body: JSON.stringify(dto) }),

  getMerchant: (id: number) =>
    http<MerchantDetail>(`/api/v1/admin/merchants/${id}`),

  updateMerchant: (id: number, dto: object) =>
    http<Merchant>(`/api/v1/admin/merchants/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  // Plans
  listPlans: () =>
    http<Plan[]>('/api/v1/admin/plans'),

  seedPlans: () =>
    http<{ seeded: boolean; count?: number; message?: string }>('/api/v1/admin/plans/seed-defaults', { method: 'POST' }),

  // Subscriptions
  listSubscriptions: (merchantId?: number) =>
    http<MerchantSubscription[]>(`/api/v1/admin/subscriptions${merchantId ? `?merchantId=${merchantId}` : ''}`),

  updateSubscription: (id: number, dto: object) =>
    http<MerchantSubscription>(`/api/v1/admin/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  // Payments
  listPayments: (merchantId?: number) =>
    http<PlatformPayment[]>(`/api/v1/admin/payments${merchantId ? `?merchantId=${merchantId}` : ''}`),

  // Merchant users
  listMerchantUsers: (merchantId: number) =>
    http<MerchantUser[]>(`/api/v1/admin/merchants/${merchantId}/users`),

  createMerchantUser: (merchantId: number, dto: object) =>
    http<MerchantUser>(`/api/v1/admin/merchants/${merchantId}/users`, {
      method: 'POST', body: JSON.stringify(dto),
    }),

  updateMerchantUser: (merchantId: number, userId: number, dto: object) =>
    http<MerchantUser>(`/api/v1/admin/merchants/${merchantId}/users/${userId}`, {
      method: 'PATCH', body: JSON.stringify(dto),
    }),
};

// ── Product Families ──────────────────────────────────────────────────────────

export const productFamilies = {
  list: () =>
    http<ProductFamily[]>('/api/v1/product-families'),

  get: (id: number) =>
    http<ProductFamilyDetail>(`/api/v1/product-families/${id}`),

  suggestions: () =>
    http<FamilySuggestion[]>('/api/v1/product-families/suggestions'),

  byProduct: (productId: number) =>
    http<{ familyId: number; familyName: string } | null>(`/api/v1/product-families/by-product/${productId}`),

  create: (dto: object) =>
    http<ProductFamilyDetail>('/api/v1/product-families', { method: 'POST', body: JSON.stringify(dto) }),

  update: (id: number, dto: object) =>
    http<ProductFamilyDetail>(`/api/v1/product-families/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),

  remove: (id: number) =>
    http<{ deleted: boolean }>(`/api/v1/product-families/${id}`, { method: 'DELETE' }),

  addProducts: (id: number, productIds: number[]) =>
    http<ProductFamilyDetail>(`/api/v1/product-families/${id}/products`, {
      method: 'POST',
      body: JSON.stringify({ productIds }),
    }),

  removeProduct: (id: number, productId: number) =>
    http<ProductFamilyDetail>(`/api/v1/product-families/${id}/products/${productId}`, { method: 'DELETE' }),
};

// ── util ───────────────────────────────────────────────────────────────────────

function qs(params?: object): string {
  if (!params) return '';
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
}
