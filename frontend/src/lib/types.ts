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
  extraCosts: string | null;
  costIncludesVat: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNr: string;
  itemNr: string | null;
  sku: string | null;
  productTitleEn: string | null;
  productTitleAr: string | null;
  brandEn: string | null;
  brandAr: string | null;
  itemStatus: string | null;
  netProceeds: string | null;
  referralFee: string | null;
  fbnOutboundFee: string | null;
  totalPayment: string | null;
  orderedDate: string | null;
  deliveredDate: string | null;
  returnedDate: string | null;
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
  pdfFilename: string | null;
  pdfOriginalName: string | null;
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

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface InventoryStockDetail {
  sku: string;
  nameEn: string | null;
  nameAr: string | null;
  brand: string | null;
  warehouse: { id: number; name: string; code: string | null } | null;
  qty: number;
  unitCost: string | null;
  extraCosts: string | null;
  lastPurchaseCost: string | null;
  sellingPrice: string | null;
  expectedMarginPct: number | null;
  totalValue: number | null;
  lastMovementDate: string | null;
  stockStatus: StockStatus;
  isStale: boolean;
  hasCost: boolean;
  costExceedsPrice: boolean;
}

export interface InventoryDashboard {
  kpis: {
    totalValue: number;
    totalSkus: number;
    outOfStock: number;
    lowStock: number;
    missingCost: number;
    staleInventory: number;
  };
  alerts: {
    zeroStockRecentSales:  Array<{ sku: string; nameEn: string | null; qty: number }>;
    missingCostInStock:    Array<{ sku: string; nameEn: string | null; qty: number }>;
    costExceedsPrice:      Array<{ sku: string; nameEn: string | null; unitCost: string | null; sellingPrice: string | null }>;
    noMovement60Days:      Array<{ sku: string; nameEn: string | null; qty: number; lastMovementDate: string | null }>;
  };
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
  badge: 'profitable' | 'low_margin' | 'loss' | 'missing_cost' | 'no_fees_allocated';
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

export interface ImportResult {
  batchId: string;
  format: 'monthly' | 'old';
  rowsImported: number;
  rowsSkipped: number;
  rowsUpdated: number;
  salesCount: number;
  returnsCount: number;
  feesCount: number;
  totalSales: number;
  totalFees: number;
  feesVat: number;
  warnings: string[];
}

export interface ImportBatch {
  id: number;
  batchId: string;
  importType: string;
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

export interface InvoiceItem {
  id: number;
  invoiceId: number;
  sku: string;
  productId: number | null;
  quantity: number;
  unitPrice: string;
  vatRate: string;
  lineSubtotal: string;
  lineVat: string;
  lineTotal: string;
}

export interface InvoiceDetail extends Invoice {
  items: InvoiceItem[];
  warehouse: { id: number; name: string; code: string | null } | null;
  _count?: { items: number };
}

export interface Warehouse {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
  organizationId: number;
  createdAt: string;
}

export interface InventoryMovement {
  id: number;
  sku: string;
  movementType: string;
  quantity: number;
  qtyBefore: number;
  qtyAfter: number;
  unitCost: string | null;
  costImpact: number | null;
  reference: string | null;
  notes: string | null;
  isVoid: boolean;
  invoiceId: number | null;
  warehouseId: number | null;
  createdAt: string;
  warehouse: { id: number; name: string } | null;
  product: { id?: number; sku?: string; nameEn: string | null } | null;
}

export interface SalesRow {
  sku: string;
  brand: string;
  name: string;
  units: number;
  revenue: number;
  fees: number;
  cogs: number;
  profit: number;
}

export interface FeesRow {
  sku: string;
  brand: string;
  units: number;
  referralFees: number;
  fbnFees: number;
  totalFees: number;
  revenue: number;
  feeRate: number;
}

export interface JournalLine {
  id: number;
  journalId: number;
  accountAr: string;
  debit: string;
  credit: string;
}

export interface JournalEntry {
  id: number;
  entryDate: string;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
  lines: JournalLine[];
}
