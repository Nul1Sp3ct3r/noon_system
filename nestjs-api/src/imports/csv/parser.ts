import { parse } from 'csv-parse/sync';
import { BadRequestException } from '@nestjs/common';
import { CustomerRow, OldRow, WeeklyRow, InventoryRow, FeeRow, ParsedCsv } from './types';

// ── Column name normalizer ────────────────────────────────────────────────────
// Maps both title-case ("Net Proceeds") and snake_case ("net_proceeds") to the
// same canonical key so detection and reads work with any Noon CSV variant.
function norm(col: string): string {
  return col
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')       // remove parentheses
    .replace(/[\s\-]+/g, '_')   // spaces / hyphens → underscore
    .replace(/_+/g, '_')        // collapse consecutive underscores
    .replace(/^_|_$/g, '');     // strip leading / trailing underscores
}

// Rebuild every record so keys are normalized (original values untouched).
function normalizeRecords(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  return records.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[norm(k)] = v;
    return out;
  });
}

// ── Format detection signatures (normalized column names) ─────────────────────

// Monthly statement: Transaction Type + Document Type driven rows
const MONTHLY_DETECT = [
  'transaction_type',
  'document_type',
  'document_subtype',
  'price_including_vat_document_currency',
  'vat_amount_document_currency',
];

// Weekly Noon sales: per-row order data with extra fee breakdown columns
// These columns are present in weekly but NOT in the old/manual sales format
const WEEKLY_DETECT = ['id_partner', 'fee_name', 'shipping_fee'];

// Full inventory snapshot
const INVENTORY_DETECT = ['warehouse_code', 'inventory_type', 'inventory_snapshot_at', 'box_barcode'];

// Old / sales CSV: per-row financial columns (also present in weekly, checked after weekly)
const OLD_DETECT = ['net_proceeds', 'referral_fee', 'fbn_outbound_fee'];

// Required columns — surfaced as readable errors if hint is provided but file is wrong
const MONTHLY_REQUIRED   = ['transaction_type', 'document_type', 'source_doc_nr', 'source_doc_line_nr', 'price_including_vat_document_currency'];
const WEEKLY_REQUIRED    = ['order_nr', 'item_nr', 'net_proceeds', 'total_payment', 'fee_name'];
const INVENTORY_REQUIRED = ['warehouse_code', 'qty', 'inventory_type'];

// ── Fee category classifier ───────────────────────────────────────────────────
export function classifyFeeDescription(desc: string): string {
  const d = (desc ?? '').toLowerCase();
  if (d.includes('referral'))                                                    return 'referralFee';
  if (d.includes('fbn outbound') || d.includes('fbn out'))                      return 'fbnOutboundFee';
  if (d.includes('storage'))                                                     return 'storageFee';
  if (d.includes('return administration') || d.includes('return admin'))         return 'returnFee';
  if (d.includes('damaged return') || d.includes('damaged item'))               return 'damageFee';
  if (d.includes('rtv') || d.includes('removal'))                               return 'removalFee';
  if (d.includes('compensation') || d.includes('damage compensation'))          return 'compensation';
  return 'other';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function sanitize(val: unknown): string {
  if (val == null) return '';
  const s = String(val).trim();
  if (s === 'nan' || s === 'NaN' || s === 'None') return '';
  return s.replace(FORMULA_PREFIX, '').slice(0, 1024);
}

function toFloat(val: unknown): number {
  const s = String(val ?? '').replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Flask: int(float(raw)) — "1.0" → "1"
function normalizeItemNr(raw: string): string {
  if (!raw) return raw;
  const n = parseFloat(raw);
  if (!isNaN(n) && Number.isFinite(n)) return String(Math.floor(n));
  return raw;
}

// ── Public entry point ────────────────────────────────────────────────────────
// hintType is the explicit importType selected by the user on the frontend.
// It takes priority over auto-detection but still validates required columns.
export function parseCsvBuffer(buffer: Buffer, hintType?: string): ParsedCsv {
  let rawRecords: Record<string, unknown>[];

  try {
    rawRecords = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
  } catch {
    throw new BadRequestException('Invalid CSV file — could not be parsed');
  }

  if (rawRecords.length === 0) {
    throw new BadRequestException('CSV file is empty');
  }

  // Normalize all column names so detection works regardless of casing / style.
  const records = normalizeRecords(rawRecords);
  const cols = new Set(Object.keys(records[0]));

  // Structured log — visible in Vercel function logs for every import
  console.log(JSON.stringify({
    event:    'csv_detect',
    hintType: hintType ?? 'auto',
    rows:     records.length,
    columns:  [...cols].slice(0, 25),
  }));

  // ── Explicit hint: validate required columns then parse ──────────────────────
  if (hintType === 'full_inventory') {
    const missing = INVENTORY_REQUIRED.filter(c => !cols.has(c));
    if (missing.length) {
      throw new BadRequestException(
        `الأعمدة المطلوبة غير موجودة في ملف المخزون: ${missing.join(', ')}`,
      );
    }
    return parseInventory(records);
  }

  if (hintType === 'weekly_noon') {
    const missing = WEEKLY_REQUIRED.filter(c => !cols.has(c));
    if (missing.length) {
      throw new BadRequestException(
        `الأعمدة المطلوبة غير موجودة في الملف الأسبوعي: ${missing.join(', ')}`,
      );
    }
    return parseWeekly(records);
  }

  // ── Auto-detection (checked in priority order) ───────────────────────────────
  const isInventory = INVENTORY_DETECT.every(c => cols.has(c));
  const isMonthly   = MONTHLY_DETECT.every(c => cols.has(c));
  const isWeekly    = WEEKLY_DETECT.every(c => cols.has(c));   // checked before OLD
  const isOld       = OLD_DETECT.every(c => cols.has(c));

  console.log(JSON.stringify({ event: 'csv_autodetect', isInventory, isMonthly, isWeekly, isOld }));

  if (isInventory) return parseInventory(records);
  if (isMonthly) {
    const missing = MONTHLY_REQUIRED.filter(c => !cols.has(c));
    if (missing.length) {
      throw new BadRequestException(
        `الأعمدة المطلوبة غير موجودة في الملف الشهري: ${missing.join(', ')}`,
      );
    }
    return parseMonthly(records);
  }
  if (isWeekly)    return parseWeekly(records);
  if (isOld)       return parseOld(records);

  throw new BadRequestException(
    'تنسيق الملف غير معروف. تأكد من رفع ملف CSV صحيح من بوابة نون.',
  );
}

// ── Monthly statement parser ──────────────────────────────────────────────────
function parseMonthly(records: Record<string, unknown>[]): ParsedCsv {
  const customerRows: CustomerRow[] = [];
  const feeRows: FeeRow[] = [];
  let statementNr = '';
  let statementDate = '';

  for (const row of records) {
    const txType = sanitize(row['transaction_type']);

    if (txType === 'Customer') {
      const docType = sanitize(row['document_type']);
      if (docType !== 'Invoice' && docType !== 'Creditnote') continue;

      const orderNr    = sanitize(row['source_doc_nr']);
      const rawItemNr  = sanitize(row['source_doc_line_nr']);
      if (!orderNr || !rawItemNr) continue;

      const inclVat = toFloat(row['price_including_vat_document_currency']);
      const vat     = toFloat(row['vat_amount_document_currency']);

      customerRows.push({
        docType: docType as 'Invoice' | 'Creditnote',
        docDate:        sanitize(row['document_date']),
        orderNr,
        itemNr:         normalizeItemNr(rawItemNr),
        sku:            sanitize(row['sku']),
        partnerSku:     sanitize(row['partner_sku']),
        productTitleEn: sanitize(row['description']),
        netProceeds:    inclVat,
        vatAmount:      vat,
      });
    } else if (txType === 'Statement Fee' || txType === 'Service Fee') {
      const inclVat = toFloat(row['price_including_vat_document_currency']);
      const vat     = toFloat(row['vat_amount_document_currency']);
      // Read exclVat from its own column; fallback to inclVat - vat if column is absent or zero
      const exclRaw = toFloat(row['price_excluding_vat_document_currency']);
      const excl    = exclRaw !== 0 ? exclRaw : parseFloat((inclVat - vat).toFixed(4));
      const sNr     = sanitize(row['source_doc_nr']);
      const sDate   = sanitize(row['document_date']);
      const desc    = sanitize(row['description']);

      if (!statementNr && sNr)     statementNr   = sNr;
      if (!statementDate && sDate) statementDate = sDate;

      feeRows.push({
        feeType:       txType,
        description:   desc,
        category:      classifyFeeDescription(desc),
        exclVat:       excl,
        vatAmount:     vat,
        inclVat,
        statementNr:   sNr,
        statementDate: sDate,
      });
    }
  }

  return { format: 'monthly', customerRows, oldRows: [], weeklyRows: [], inventoryRows: [], feeRows, statementNr, statementDate };
}

// ── Old / sales CSV parser ────────────────────────────────────────────────────
function parseOld(records: Record<string, unknown>[]): ParsedCsv {
  const oldRows: OldRow[] = [];

  let statementNr   = sanitize(records[0]?.['statement_nr']);
  let statementDate = sanitize(records[0]?.['statement_date']);

  for (const row of records) {
    const orderNr = sanitize(row['order_nr']);
    const itemNr  = sanitize(row['item_nr']);
    if (!orderNr || !itemNr) continue;

    if (!statementNr   && row['statement_nr'])   statementNr   = sanitize(row['statement_nr']);
    if (!statementDate && row['statement_date']) statementDate = sanitize(row['statement_date']);

    oldRows.push({
      orderNr,
      itemNr,
      sku:             sanitize(row['sku']),
      partnerSku:      sanitize(row['partner_sku']),
      brandEn:         sanitize(row['brand_english'] ?? row['brand_en'] ?? row['brand']),
      brandAr:         sanitize(row['brand_arabic']  ?? row['brand_ar']),
      productTitleEn:  sanitize(row['product_title_english'] ?? row['product_title_en'] ?? row['description']),
      productTitleAr:  sanitize(row['product_title_arabic']  ?? row['product_title_ar']),
      itemStatus:      sanitize(row['item_status']).toLowerCase(),
      orderedDate:     sanitize(row['ordered_date']),
      deliveredDate:   sanitize(row['delivered_date']),
      returnedDate:    sanitize(row['returned_date']),
      netProceeds:     toFloat(row['net_proceeds']),
      referralFee:     toFloat(row['referral_fee']),
      fbnOutboundFee:  toFloat(row['fbn_outbound_fee']),
      totalPayment:    toFloat(row['total_payment']),
    });
  }

  return { format: 'old', customerRows: [], oldRows, weeklyRows: [], inventoryRows: [], feeRows: [], statementNr, statementDate };
}

// ── Weekly Noon sales parser ──────────────────────────────────────────────────
// Maps the exact snake_case headers from ملف_المبيعات_الاسبوعي.csv
function parseWeekly(records: Record<string, unknown>[]): ParsedCsv {
  const weeklyRows: WeeklyRow[] = [];
  const feeRows: FeeRow[] = [];

  let statementNr   = sanitize(records[0]?.['statement_nr']);
  let statementDate = sanitize(records[0]?.['statement_date']);

  for (const row of records) {
    const orderNr = sanitize(row['order_nr']);
    const rawItem = sanitize(row['item_nr']);
    const feeName = sanitize(row['fee_name'] ?? '');

    if (!statementNr   && row['statement_nr'])   statementNr   = sanitize(row['statement_nr']);
    if (!statementDate && row['statement_date']) statementDate = sanitize(row['statement_date']);

    // Fee-only rows: no order/item id AND fee_name is something other than "Order"
    // e.g. "Return Administration Fee" with other_amounts=-0.90 and empty order_nr
    if ((!orderNr || !rawItem) && feeName && feeName.toLowerCase() !== 'order') {
      const other      = toFloat(row['other_amounts']);
      const refFee     = toFloat(row['referral_fee']);
      const fbnFee     = toFloat(row['fbn_outbound_fee']);
      const rawAmount  = other !== 0 ? other : refFee !== 0 ? refFee : fbnFee;
      const inclVat    = Math.abs(rawAmount);
      if (inclVat > 0) {
        feeRows.push({
          feeType:      'Statement Fee',
          description:  feeName,
          category:     classifyFeeDescription(feeName),
          exclVat:      inclVat,   // VAT breakdown not available in weekly CSV
          vatAmount:    0,
          inclVat,
          statementNr,
          statementDate,
        });
      }
      continue;
    }

    // Rows without order/item identifiers are skipped
    if (!orderNr || !rawItem) continue;

    weeklyRows.push({
      orderNr,
      itemNr:         normalizeItemNr(rawItem),
      sku:            sanitize(row['sku']),
      partnerSku:     sanitize(row['partner_sku']),
      brandEn:        sanitize(row['brand_en']),
      brandAr:        sanitize(row['brand_ar']),
      productTitleEn: sanitize(row['product_title_en']),
      productTitleAr: sanitize(row['product_title_ar']),
      feeName:        sanitize(row['fee_name']),
      itemStatus:     sanitize(row['item_status']).toLowerCase(),
      orderedDate:    sanitize(row['ordered_date']),
      shippedDate:    sanitize(row['shipped_date']),
      deliveredDate:  sanitize(row['delivered_date']),
      returnedDate:   sanitize(row['returned_date']),
      netProceeds:    toFloat(row['net_proceeds']),
      referralFee:    toFloat(row['referral_fee']),
      fbnOutboundFee: toFloat(row['fbn_outbound_fee']),
      shippingFee:    toFloat(row['shipping_fee']),
      noonMarkup:     toFloat(row['noon_markup']),
      noonPromo:      toFloat(row['noon_promo']),
      otherAmounts:   toFloat(row['other_amounts']),
      totalPayment:   toFloat(row['total_payment']),
    });
  }

  return {
    format: 'weekly_noon',
    customerRows: [],
    oldRows: [],
    weeklyRows,
    inventoryRows: [],
    feeRows,
    statementNr,
    statementDate,
  };
}

// ── Full inventory snapshot parser ────────────────────────────────────────────
// Maps the exact snake_case headers from Inventory (1).csv
function parseInventory(records: Record<string, unknown>[]): ParsedCsv {
  const inventoryRows: InventoryRow[] = [];

  for (const row of records) {
    const sku        = sanitize(row['sku']);
    const partnerSku = sanitize(row['partner_sku']);
    // Must have at least one identifier
    if (!sku && !partnerSku) continue;

    inventoryRows.push({
      warehouseCode:      sanitize(row['warehouse_code']),
      barcode:            sanitize(row['barcode']),
      qty:                Math.round(toFloat(row['qty'])), // qty is integer
      inventoryType:      sanitize(row['inventory_type']),
      sku,
      partnerSku,
      title:              sanitize(row['title']),
      brand:              sanitize(row['brand']),
      family:             sanitize(row['family']),
      reasonCode:         sanitize(row['reason_code']),
      snapshotAt:         sanitize(row['inventory_snapshot_at']),
      pbarcode:           sanitize(row['pbarcode']),
      classificationCode: sanitize(row['classification_code']),
    });
  }

  const snapshotDate = sanitize(records[0]?.['inventory_snapshot_at']).slice(0, 10);

  return {
    format: 'full_inventory',
    customerRows: [],
    oldRows: [],
    weeklyRows: [],
    inventoryRows,
    feeRows: [],
    statementNr:  '',
    statementDate: snapshotDate,
  };
}
