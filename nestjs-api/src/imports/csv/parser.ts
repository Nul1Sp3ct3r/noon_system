import { parse } from 'csv-parse/sync';
import { BadRequestException } from '@nestjs/common';
import { CustomerRow, OldRow, FeeRow, ParsedCsv } from './types';

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

// ── Format signatures (normalized column names) ───────────────────────────────
// Monthly statement: Transaction Type + Document Type driven rows
const MONTHLY_DETECT = [
  'transaction_type',
  'document_type',
  'document_subtype',
  'price_including_vat_document_currency',
  'vat_amount_document_currency',
];

// Old / sales CSV: per-row financial columns
const OLD_DETECT = ['net_proceeds', 'referral_fee', 'fbn_outbound_fee'];

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
export function parseCsvBuffer(buffer: Buffer): ParsedCsv {
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

  const isMonthly = MONTHLY_DETECT.every(c => cols.has(c));
  const isOld     = OLD_DETECT.every(c => cols.has(c));

  if (!isMonthly && !isOld) {
    throw new BadRequestException(
      'تنسيق الملف غير معروف. تأكد من رفع ملف CSV صحيح من بوابة نون.',
    );
  }

  return isMonthly ? parseMonthly(records) : parseOld(records);
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
      const excl    = parseFloat((inclVat - vat).toFixed(4));
      const sNr     = sanitize(row['source_doc_nr']);
      const sDate   = sanitize(row['document_date']);

      if (!statementNr && sNr)     statementNr   = sNr;
      if (!statementDate && sDate) statementDate = sDate;

      feeRows.push({
        feeType:      txType,
        description:  sanitize(row['description']),
        exclVat:      excl,
        vatAmount:    vat,
        inclVat,
        statementNr:  sNr,
        statementDate: sDate,
      });
    }
  }

  return { format: 'monthly', customerRows, oldRows: [], feeRows, statementNr, statementDate };
}

// ── Old / sales CSV parser ────────────────────────────────────────────────────
// Real Noon files use snake_case headers (order_nr, net_proceeds, …) which
// after normalization are identical to what we read below.
function parseOld(records: Record<string, unknown>[]): ParsedCsv {
  const oldRows: OldRow[] = [];

  // statement_nr / statement_date live as row-level columns in real Noon files.
  let statementNr   = sanitize(records[0]?.['statement_nr']);
  let statementDate = sanitize(records[0]?.['statement_date']);

  for (const row of records) {
    const orderNr = sanitize(row['order_nr']);
    const itemNr  = sanitize(row['item_nr']);
    if (!orderNr || !itemNr) continue;

    // Keep first non-empty statement metadata found in any row
    if (!statementNr   && row['statement_nr'])   statementNr   = sanitize(row['statement_nr']);
    if (!statementDate && row['statement_date']) statementDate = sanitize(row['statement_date']);

    oldRows.push({
      orderNr,
      itemNr,
      // "sku" may be absent in some Noon report variants; fall back to partner_sku
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

  return { format: 'old', customerRows: [], oldRows, feeRows: [], statementNr, statementDate };
}
