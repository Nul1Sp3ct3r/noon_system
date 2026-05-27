import Cookies from 'js-cookie';
import type { AuthTokens, PaginatedResponse, Product, Order, Invoice, InventoryStock, PlRow, VatRow, ProfitabilityRow, SettlementRow } from './types';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = Cookies.get('token');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) return http<T>(path, init);
    Cookies.remove('token');
    Cookies.remove('refreshToken');
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
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
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    http<PaginatedResponse<Invoice>>(`/api/v1/invoices?${qs(params)}`),
};

// ── Inventory ──────────────────────────────────────────────────────────────────

export const inventory = {
  stock: () => http<InventoryStock[]>('/api/v1/inventory/stock'),
};

// ── Reports ────────────────────────────────────────────────────────────────────

export const reports = {
  pl:        (year?: number) => http<PlRow[]>(`/api/v1/reports/pl?${qs({ year })}`),
  sales:     (params?: object) => http<unknown[]>(`/api/v1/reports/sales?${qs(params)}`),
  fees:      (params?: object) => http<unknown[]>(`/api/v1/reports/fees?${qs(params)}`),
  inventory: ()                => http<InventoryStock[]>('/api/v1/reports/inventory'),
  invoices:  (year?: number)   => http<unknown>(`/api/v1/reports/invoices?${qs({ year })}`),
};

// ── VAT Center ─────────────────────────────────────────────────────────────────

export const vatCenter = {
  breakdown: (year?: number) =>
    http<{ year: number; months: VatRow[] }>(`/api/v1/vat-center?${qs({ year })}`),
};

// ── Profitability ──────────────────────────────────────────────────────────────

export const profitability = {
  list: (params?: { startDate?: string; endDate?: string; brand?: string }) =>
    http<ProfitabilityRow[]>(`/api/v1/profitability?${qs(params)}`),
};

// ── Settlements ────────────────────────────────────────────────────────────────

export const settlements = {
  list: (params?: { page?: number; limit?: number }) =>
    http<PaginatedResponse<SettlementRow>>(`/api/v1/settlements?${qs(params)}`),
};

// ── Admin ──────────────────────────────────────────────────────────────────────

export const admin = {
  performance: () => http<{ counts: Record<string, number> }>('/api/v1/admin/performance'),
  auditLogs:   (params?: object) => http<unknown>(`/api/v1/admin/audit-logs?${qs(params)}`),
  users:       () => http<unknown[]>('/api/v1/admin/users'),
  updateUser:  (id: number, dto: object) =>
    http<unknown>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
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
