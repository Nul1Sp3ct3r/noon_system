import { parse } from 'csv-parse/sync';
import { BadRequestException } from '@nestjs/common';
import { CustomerRow, OldRow, FeeRow, ParsedCsv } from './types';

// Monthly format: detected by these 5 columns all being present
const MONTHLY_DETECT = [
  'Transaction Type',
  'Document Type',
  'Document Subtype',
  'Price Including VAT (Document Currency)',
  'VAT Amount (Document Currency)',
];

// Old format: detected by these 3 columns all being present
const OLD_DETECT = ['Net Proceeds', 'Referral Fee', 'FBN Outbound Fee'];

// Column name → OldRow field mapping
const CSV_COLUMN_MAP: Record<string, keyof OldRow> = {
  'Order Nr':                'orderNr',
  'Item Nr':                 'itemNr',
  'SKU':                     'sku',
  'Partner SKU':             'partnerSku',
  'Brand (English)':         'brandEn',
  'Product Title (English)': 'productTitleEn',
  'Item Status':             'itemStatus',
  'Ordered Date':            'orderedDate',
  'Net Proceeds':            'netProceeds',
  'Referral Fee':            'referralFee',
  'FBN Outbound Fee':        'fbnOutboundFee',
  'Total Payment':           'totalPayment',
};

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

// Converts "1.0" → "1", matching Flask's int(float(raw)) logic
function normalizeItemNr(raw: string): string {
  if (!raw) return raw;
  const n = parseFloat(raw);
  if (!isNaN(n) && Number.isFinite(n)) return String(Math.floor(n));
  return raw;
}

export function parseCsvBuffer(buffer: Buffer): ParsedCsv {
  let records: Record<string, unknown>[];

  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
  } catch {
    throw new BadRequestException('Invalid CSV file — could not be parsed');
  }

  if (records.length === 0) {
    throw new BadRequestException('CSV file is empty');
  }

  const cols = new Set(Object.keys(records[0]));
  const isMonthly = MONTHLY_DETECT.every(c => cols.has(c));
  const isOld = OLD_DETECT.every(c => cols.has(c));

  if (!isMonthly && !isOld) {
    throw new BadRequestException(
      'تنسيق الملف غير معروف. تأكد من رفع ملف CSV صحيح من بوابة نون.',
    );
  }

  return isMonthly ? parseMonthly(records) : parseOld(records);
}

function parseMonthly(records: Record<string, unknown>[]): ParsedCsv {
  const customerRows: CustomerRow[] = [];
  const feeRows: FeeRow[] = [];
  let statementNr = '';
  let statementDate = '';

  for (const row of records) {
    const txType = sanitize(row['Transaction Type']);

    if (txType === 'Customer') {
      const docType = sanitize(row['Document Type']);
      if (docType !== 'Invoice' && docType !== 'Creditnote') continue;

      const orderNr = sanitize(row['Source Doc Nr']);
      const rawItemNr = sanitize(row['Source Doc Line Nr']);
      if (!orderNr || !rawItemNr) continue;

      const inclVat = toFloat(row['Price Including VAT (Document Currency)']);
      const vat = toFloat(row['VAT Amount (Document Currency)']);

      customerRows.push({
        docType: docType as 'Invoice' | 'Creditnote',
        docDate: sanitize(row['Document Date']),
        orderNr,
        itemNr: normalizeItemNr(rawItemNr),
        sku: sanitize(row['SKU']),
        partnerSku: sanitize(row['Partner SKU']),
        productTitleEn: sanitize(row['Description']),
        netProceeds: inclVat,
        vatAmount: vat,
      });
    } else if (txType === 'Statement Fee' || txType === 'Service Fee') {
      const inclVat = toFloat(row['Price Including VAT (Document Currency)']);
      const vat = toFloat(row['VAT Amount (Document Currency)']);
      const excl = parseFloat((inclVat - vat).toFixed(4));
      const sNr = sanitize(row['Source Doc Nr']);
      const sDate = sanitize(row['Document Date']);

      if (!statementNr && sNr) statementNr = sNr;
      if (!statementDate && sDate) statementDate = sDate;

      feeRows.push({
        feeType: txType,
        description: sanitize(row['Description']),
        exclVat: excl,
        vatAmount: vat,
        inclVat,
        statementNr: sNr,
        statementDate: sDate,
      });
    }
  }

  return { format: 'monthly', customerRows, oldRows: [], feeRows, statementNr, statementDate };
}

function parseOld(records: Record<string, unknown>[]): ParsedCsv {
  const oldRows: OldRow[] = [];

  for (const row of records) {
    const orderNr = sanitize(row['Order Nr']);
    const itemNr = sanitize(row['Item Nr']);
    if (!orderNr || !itemNr) continue;

    oldRows.push({
      orderNr,
      itemNr,
      sku:            sanitize(row['SKU']),
      partnerSku:     sanitize(row['Partner SKU']),
      brandEn:        sanitize(row['Brand (English)']),
      productTitleEn: sanitize(row['Product Title (English)']),
      itemStatus:     sanitize(row['Item Status']),
      orderedDate:    sanitize(row['Ordered Date']),
      netProceeds:    toFloat(row['Net Proceeds']),
      referralFee:    toFloat(row['Referral Fee']),
      fbnOutboundFee: toFloat(row['FBN Outbound Fee']),
      totalPayment:   toFloat(row['Total Payment']),
    });
  }

  // CSV_COLUMN_MAP kept for reference — unused directly but documents mapping
  void CSV_COLUMN_MAP;

  return { format: 'old', customerRows: [], oldRows, feeRows: [], statementNr: '', statementDate: '' };
}
