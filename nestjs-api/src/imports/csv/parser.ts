import { parse } from 'csv-parse/sync';
import { BadRequestException } from '@nestjs/common';
import { CustomerRow, FeeRow, ParsedCsv } from './types';

const MONTHLY_REQUIRED = new Set([
  'Transaction Type',
  'Document Type',
  'Price Including VAT (Document Currency)',
  'VAT Amount (Document Currency)',
  'Source Doc Nr',
  'Source Doc Line Nr',
  'SKU',
  'Document Date',
]);

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
  const missing = [...MONTHLY_REQUIRED].filter(c => !cols.has(c));
  if (missing.length > 0) {
    throw new BadRequestException(
      `Unrecognised CSV format — missing columns: ${missing.join(', ')}`,
    );
  }

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
      const itemNr = sanitize(row['Source Doc Line Nr']);
      if (!orderNr || !itemNr) continue;

      const inclVat = toFloat(row['Price Including VAT (Document Currency)']);
      const vat = toFloat(row['VAT Amount (Document Currency)']);

      customerRows.push({
        docType: docType as 'Invoice' | 'Creditnote',
        docDate: sanitize(row['Document Date']),
        orderNr,
        itemNr,
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

  return { customerRows, feeRows, statementNr, statementDate };
}
