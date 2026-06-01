export interface CustomerRow {
  docType: 'Invoice' | 'Creditnote';
  docDate: string;
  orderNr: string;
  itemNr: string;
  sku: string;
  partnerSku: string;
  productTitleEn: string;
  netProceeds: number;
  vatAmount: number;
}

export interface OldRow {
  orderNr: string;
  itemNr: string;
  sku: string;
  partnerSku: string;
  brandEn: string;
  brandAr: string;
  productTitleEn: string;
  productTitleAr: string;
  itemStatus: string;
  orderedDate: string;
  deliveredDate: string;
  returnedDate: string;
  netProceeds: number;
  referralFee: number;
  fbnOutboundFee: number;
  totalPayment: number;
}

// Weekly Noon sales report — ملف_المبيعات_الاسبوعي.csv
// Real headers (snake_case): id_partner, statement_date, statement_nr, order_nr, item_nr,
//   brand_en, product_title_en, brand_ar, product_title_ar, sku, partner_sku, fee_name,
//   item_status, ordered_date, shipped_date, delivered_date, returned_date,
//   net_proceeds, referral_fee, fbn_outbound_fee, noon_markup, noon_promo,
//   shipping_fee, other_amounts, total_payment
export interface WeeklyRow {
  orderNr: string;
  itemNr: string;
  sku: string;
  partnerSku: string;
  brandEn: string;
  brandAr: string;
  productTitleEn: string;
  productTitleAr: string;
  feeName: string;
  itemStatus: string;
  orderedDate: string;
  shippedDate: string;
  deliveredDate: string;
  returnedDate: string;
  netProceeds: number;
  referralFee: number;
  fbnOutboundFee: number;
  shippingFee: number;
  noonMarkup: number;
  noonPromo: number;
  otherAmounts: number;
  totalPayment: number;
}

// Full inventory snapshot — Inventory (1).csv
// Real headers: box_barcode, warehouse_code, barcode, qty, id_partner, inventory_type,
//   pbarcode, sku, partner_sku, weight, volumetric_weight, shortest_side, median_side,
//   longest_side, title, brand, family, reason_code, inventory_snapshot_at,
//   country_code, classification_code
export interface InventoryRow {
  warehouseCode: string;
  barcode: string;
  qty: number;
  inventoryType: string;
  sku: string;
  partnerSku: string;
  title: string;
  brand: string;
  family: string;
  reasonCode: string;
  snapshotAt: string;
  pbarcode: string;
  classificationCode: string;
}

export interface FeeRow {
  feeType:      string;
  description:  string;
  category:     string;  // referralFee|fbnOutboundFee|storageFee|returnFee|damageFee|removalFee|compensation|other
  exclVat:      number;
  vatAmount:    number;
  inclVat:      number;
  statementNr:  string;
  statementDate: string;
}

export interface ParsedCsv {
  format: 'monthly' | 'old' | 'weekly_noon' | 'full_inventory';
  customerRows: CustomerRow[];
  oldRows: OldRow[];
  weeklyRows: WeeklyRow[];
  inventoryRows: InventoryRow[];
  feeRows: FeeRow[];
  statementNr: string;
  statementDate: string;
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
