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
    todayMovements: number;
    thisMonthPurchases: number;
    thisMonthIssues: number;
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
  referenceType: string | null;
  reasonCode: string | null;
  unitCostOverride: string | null;
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
  accountId: number | null;
  accountAr: string;
  debit: string;
  credit: string;
  notes: string | null;
  account: { id: number; code: string; nameAr: string } | null;
}

export interface JournalEntry {
  id: number;
  journalNumber: string | null;
  entryDate: string;
  description: string | null;
  reference: string | null;
  status: 'draft' | 'posted' | 'reversed';
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
  createdBy: { id: number; fullName: string | null; username: string } | null;
  lines: JournalLine[];
}

export interface Account {
  id: number;
  organizationId: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  parentId: number | null;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  children?: Account[];
  parent?: Account | null;
}

export interface AccountingPeriod {
  id: number;
  organizationId: number;
  periodYear: number;
  periodMonth: number;
  isClosed: boolean;
  closedAt: string | null;
  closedById: number | null;
  createdAt: string;
  closedBy: { id: number; fullName: string | null; username: string } | null;
}

export interface JournalTemplate {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  templateLines: Array<{
    accountId: number | null;
    accountAr: string;
    side: 'debit' | 'credit';
    notes: string;
  }>;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface LedgerEntry {
  id: number;
  journalId: number;
  accountId: number | null;
  accountAr: string;
  debit: number;
  credit: number;
  notes: string | null;
  runningBalance: number;
  journal: {
    id: number;
    journalNumber: string | null;
    entryDate: string;
    description: string | null;
    reference: string | null;
    sourceType: string | null;
  };
}

export interface GeneralLedger {
  account: Account;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export type PaymentMethod = 'bank_transfer' | 'cash' | 'credit_card' | 'check' | 'other'
  | 'treasury' | 'stc_pay' | 'employee_advance' | 'deferred';
export type ExpenseStatus = 'draft' | 'posted' | 'pending_approval' | 'approved' | 'paid' | 'rejected';

export interface ExpenseCategory {
  id: number;
  organizationId: number;
  name: string;
  accountCode: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Expense {
  id: number;
  organizationId: number;
  expenseDate: string;
  vendor: string | null;
  categoryId: number | null;
  description: string | null;
  amountBeforeVat: string;
  vatAmount: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  vatTreatment: string | null;
  costCenter: string | null;
  accountCode: string | null;
  status: ExpenseStatus;
  journalEntryId: number | null;
  createdAt: string;
  updatedAt: string;
  category: ExpenseCategory | null;
  createdBy: { id: number; fullName: string | null; username: string } | null;
}

export interface ExpenseStats {
  totalExpenses: number;
  totalVat: number;
  count: number;
  thisMonth: number;
  topCategory: string | null;
  unpaidExpenses: number;
  monthlyAverage: number;
}
