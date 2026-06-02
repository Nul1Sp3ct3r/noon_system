export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export type UserRole =
  | 'super_admin' | 'admin' | 'user' | 'platform_admin'
  | 'merchant_owner' | 'merchant_accountant' | 'merchant_inventory'
  | 'merchant_data_entry' | 'merchant_viewer';

export interface User {
  id: number;
  username: string;
  fullName: string | null;
  role: UserRole;
  organizationId: number;
  mustChangePassword?: boolean;
}

export interface MerchantUser {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLogin: string | null;
}

// ─── Platform / SaaS layer types ─────────────────────────────────────────────

export type MerchantStatus        = 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled';
export type BillingCycle          = 'monthly' | 'yearly';
export type SubscriptionStatus    = 'active' | 'expired' | 'cancelled' | 'paused' | 'trial';
export type PlatformPaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface Plan {
  id:           number;
  name:         string;
  code:         string;
  monthlyPrice: string;
  yearlyPrice:  string;
  features:     string[];
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
}

export interface Merchant {
  id:             number;
  businessName:   string;
  ownerName:      string | null;
  email:          string | null;
  phone:          string | null;
  crNumber:       string | null;
  vatNumber:      string | null;
  status:         MerchantStatus;
  organizationId: number | null;
  notes:          string | null;
  createdAt:      string;
  updatedAt:      string;
  lastActivityAt: string | null;
  currentSubscription: MerchantSubscription | null;
}

export interface MerchantSubscription {
  id:           number;
  merchantId:   number;
  planId:       number;
  billingCycle: BillingCycle;
  startDate:    string;
  endDate:      string | null;
  status:       SubscriptionStatus;
  autoRenew:    boolean;
  price:        string;
  notes:        string | null;
  createdAt:    string;
  updatedAt:    string;
  plan:         Pick<Plan, 'id' | 'name' | 'code'> | null;
}

export interface MerchantDetail extends Merchant {
  subscriptions: MerchantSubscription[];
  payments:      PlatformPayment[];
  usage: {
    products:  number;
    orders:    number;
    imports:   number;
    users:     number;
    lastLogin: string | null;
  };
  health: {
    failedImports:        number;
    missingCostProducts:  number;
    lowStock:             number;
  };
}

export interface PlatformPayment {
  id:             number;
  merchantId:     number;
  subscriptionId: number | null;
  amount:         string;
  status:         PlatformPaymentStatus;
  paymentMethod:  string | null;
  invoiceNumber:  string | null;
  notes:          string | null;
  paidAt:         string | null;
  createdAt:      string;
  merchant:       Pick<Merchant, 'id' | 'businessName'> | null;
  subscription:   { id: number; plan: Pick<Plan, 'name'> } | null;
}

export interface PlatformKpis {
  totalMerchants:         number;
  activeMerchants:        number;
  trialMerchants:         number;
  expiredSubscriptions:   number;
  suspendedSubscriptions: number;
  mrr:                    number;
  arr:                    number;
  monthlyRevenue:         number;
  pendingPayments:        number;
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
  internalRef: string | null;
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
  format: 'monthly' | 'old' | 'weekly_noon' | 'full_inventory';
  rowsImported: number;
  rowsSkipped: number;
  rowsUpdated: number;
  salesCount: number;
  returnsCount: number;
  feesCount: number;
  totalSales: number;
  totalFees: number;
  feesVat: number;
  productsUpdated?: number;
  stockUpdated?: number;
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
  internalRef: string | null;
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

export interface ReconciliationRow {
  label:        string;
  labelAr:      string;
  noonValue:    number | null;
  pfValue:      number;
  diff:         number | null;
  isSeparator?: boolean;
  isProfit?:    boolean;
}

export interface ReconciliationDiscrepancy {
  field:              string;
  noonValue:          number;
  preciseflowValue:   number;
  diff:               number;
  note:               string;
}

export interface ReconciliationReport {
  batchId:           string;
  statementNr:       string | null;
  statementDate:     string | null;
  fileName:          string | null;
  importType:        string;
  importedAt:        string;

  grossSales:        number;
  returns:           number;
  netSales:          number;
  referralFee:       number;
  fbnFee:            number;
  returnFee:         number;
  storageFee:        number;
  damageFee:         number;
  removalFee:        number;
  compensation:      number;
  otherFees:         number;
  totalFees:         number;
  totalFeesExclVat:  number;
  totalFeesVat:      number;
  noonNetProceeds:   number;
  cogs:              number;
  finalProfit:       number;

  deliveredCount:    number;
  returnedCount:     number;
  totalOrders:       number;
  feeRowCount:       number;

  feesByCategory:    Record<string, number>;
  feeLines:          StatementFeeItem[];

  reconciliationRows: ReconciliationRow[];
  discrepancies:     ReconciliationDiscrepancy[];
  hasDiscrepancy:    boolean;
}

export interface StatementFeeItem {
  description: string;
  feeType:     string;
  category:    string;
  exclVat:     number;
  vatAmount:   number;
  inclVat:     number;
}

export interface StatementFeeSummary {
  total:        number;
  totalExclVat: number;
  totalVat:     number;
  byCategory:   Record<string, number>;
  rows:         StatementFeeItem[];
}

export interface FeesResponse {
  items:         FeesRow[];
  statementFees: StatementFeeSummary;
}

export interface ProfitabilityResponse {
  rows:          ProfitabilityRow[];
  statementFees: StatementFeeSummary;
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
