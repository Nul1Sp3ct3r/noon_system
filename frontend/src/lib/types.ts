export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface User {
  id: number;
  username: string;
  fullName: string | null;
  role: 'super_admin' | 'admin' | 'user';
  organizationId: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Product {
  id: number;
  sku: string;
  partnerSku: string | null;
  nameAr: string | null;
  nameEn: string | null;
  brand: string | null;
  unitCost: string | null;
  costIncludesVat: boolean;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNr: string;
  itemNr: string | null;
  sku: string | null;
  productTitleEn: string | null;
  brandEn: string | null;
  itemStatus: string | null;
  netProceeds: string | null;
  referralFee: string | null;
  fbnOutboundFee: string | null;
  totalPayment: string | null;
  orderedDate: string | null;
  importBatch: string | null;
}

export interface Invoice {
  id: number;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  vatMode: 'inclusive' | 'exclusive' | 'exempt';
  subtotal: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  status: string;
  notes: string | null;
}

export interface InventoryStock {
  sku: string;
  nameEn: string | null;
  brand: string | null;
  warehouse: { id: number; name: string; code: string | null } | null;
  qty: number;
  unitCost: string | null;
  totalCost: number | null;
}

export interface PlRow {
  month: string;
  revenue: number;
  referralFees: number;
  fbnFees: number;
  stmtFees: number;
  totalFees: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
}

export interface VatRow {
  month: string;
  salesInclVat: number;
  outputVat: number;
  noonFeesExcl: number;
  inputVatNoon: number;
  supplierInvoiceExcl: number;
  inputVatSupplier: number;
  stmtFeeVat: number;
  netVat: number;
}

export interface ProfitabilityRow {
  sku: string;
  nameEn: string | null;
  brand: string | null;
  units: number;
  revenue: number;
  fees: number;
  cogs: number;
  profit: number;
  profitPerUnit: number;
  badge: 'profitable' | 'low_margin' | 'loss' | 'missing_cost';
}

export interface SettlementRow {
  batchId: string;
  statementNr: string | null;
  statementDate: string | null;
  fileName: string | null;
  importedAt: string;
  salesCount: number;
  returnsCount: number;
  grossSales: number;
  totalFees: number;
  ourNet: number;
  actualPayout: number;
  mismatch: number;
  mismatchFlag: boolean;
}

export interface ImportBatch {
  id: number;
  batchId: string;
  fileName: string | null;
  rowsImported: number;
  rowsSkipped: number;
  salesCount: number;
  returnsCount: number;
  feesCount: number;
  statementNr: string | null;
  statementDate: string | null;
  status: string;
  createdAt: string;
}
