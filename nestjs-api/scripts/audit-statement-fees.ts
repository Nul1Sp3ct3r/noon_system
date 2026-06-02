/**
 * Fee-row audit script for a specific Noon monthly statement.
 *
 * Usage (from nestjs-api/):
 *   npx ts-node -e "require('./scripts/audit-statement-fees')" <path-to-csv>
 *
 *  or via ts-node directly:
 *   npx ts-node scripts/audit-statement-fees.ts "path/to/file.csv"
 *
 * Run from the nestjs-api directory so module resolution finds csv/parser.
 */

import * as fs   from 'fs';
import * as path from 'path';

// ── inline minimal parser helpers (no NestJS DI needed) ──────────────────────

const { parse } = require('csv-parse/sync');

function norm(col: string): string {
  return col.trim().toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function sanitize(val: unknown): string {
  if (val == null) return '';
  const s = String(val).trim();
  if (s === 'nan' || s === 'NaN' || s === 'None') return '';
  return s.replace(/^[=+\-@\t\r]/, '').slice(0, 1024);
}

function toFloat(val: unknown): number {
  const s = String(val ?? '').replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function classifyFeeDescription(desc: string): string {
  const d = (desc ?? '').toLowerCase();
  if (d.includes('referral'))                                             return 'referralFee';
  if (d.includes('fbn outbound') || d.includes('fbn out'))               return 'fbnOutboundFee';
  if (d.includes('storage'))                                              return 'storageFee';
  if (d.includes('return administration') || d.includes('return admin')) return 'returnFee';
  if (d.includes('damaged return') || d.includes('damaged item'))        return 'damageFee';
  if (d.includes('rtv') || d.includes('removal'))                        return 'removalFee';
  if (d.includes('compensation'))                                         return 'compensation';
  return 'other';
}

// ── run ───────────────────────────────────────────────────────────────────────

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: ts-node scripts/audit-statement-fees.ts <path-to-csv>');
  process.exit(1);
}

const buffer = fs.readFileSync(path.resolve(csvPath));

let rawRecords: Record<string, unknown>[];
try {
  rawRecords = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];
} catch (e) {
  console.error('Failed to parse CSV:', (e as Error).message);
  process.exit(1);
}

// Normalize keys
const records = rawRecords.map(row => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[norm(k)] = v;
  return out;
});

console.log(`\n${'═'.repeat(80)}`);
console.log('  NOON STATEMENT FEE AUDIT REPORT');
console.log('  CSV:', csvPath);
console.log(`  Total CSV rows: ${records.length}`);
console.log(`${'═'.repeat(80)}\n`);

// ── Separate rows by transaction type ────────────────────────────────────────

interface FeeAuditRow {
  txType:      string;
  docType:     string;
  description: string;
  rawExclVat:  number;   // as-read from column (signed)
  rawVat:      number;   // as-read from column (signed)
  rawInclVat:  number;   // as-read from column (signed)
  absExclVat:  number;   // after Math.abs()
  absVat:      number;
  absInclVat:  number;
  category:    string;
  isCredit:    boolean;  // rawInclVat > 0 → credit to seller
  orderNr:     string;
}

const customerRows: { txType: string; docType: string; orderNr: string; inclVat: number }[] = [];
const feeRows: FeeAuditRow[] = [];
const skippedRows: { txType: string; count: number }[] = [];
const txTypeCounts: Record<string, number> = {};

for (const row of records) {
  const txType = sanitize(row['transaction_type']);
  txTypeCounts[txType] = (txTypeCounts[txType] ?? 0) + 1;

  if (txType === 'Customer') {
    const inclVat = toFloat(row['price_including_vat_document_currency']);
    customerRows.push({
      txType,
      docType:  sanitize(row['document_type']),
      orderNr:  sanitize(row['source_doc_nr']),
      inclVat,
    });
  } else if (txType === 'Statement Fee' || txType === 'Service Fee') {
    const rawExclVat  = toFloat(row['price_excluding_vat_document_currency']);
    const rawVat      = toFloat(row['vat_amount_document_currency']);
    const rawInclVat  = toFloat(row['price_including_vat_document_currency']);

    // Fallback if exclVat column is missing
    const exclVatActual = rawExclVat !== 0 ? rawExclVat : rawInclVat - rawVat;
    const desc          = sanitize(row['description']);

    feeRows.push({
      txType,
      docType:    sanitize(row['document_type']),
      description: desc,
      rawExclVat: exclVatActual,
      rawVat,
      rawInclVat,
      absExclVat: Math.abs(exclVatActual),
      absVat:     Math.abs(rawVat),
      absInclVat: Math.abs(rawInclVat),
      category:   classifyFeeDescription(desc),
      isCredit:   rawInclVat > 0,
      orderNr:    sanitize(row['source_doc_nr']),
    });
  }
}

// ── Customer row summary ──────────────────────────────────────────────────────

const invoices   = customerRows.filter(r => r.docType === 'Invoice');
const creditnotes = customerRows.filter(r => r.docType === 'Creditnote');
const grossSales  = invoices.reduce((s, r) => s + r.inclVat, 0);
const returnsSum  = creditnotes.reduce((s, r) => s + r.inclVat, 0);  // signed
const netSales    = grossSales + returnsSum;  // creditnotes are negative

console.log('┌── CUSTOMER ROWS ──────────────────────────────────────────────┐');
console.log(`│  Total customer rows : ${customerRows.length}`);
console.log(`│  Invoice rows        : ${invoices.length}   → Gross Sales = ${grossSales.toFixed(2)} SAR`);
console.log(`│  Creditnote rows     : ${creditnotes.length}   → Returns    = ${returnsSum.toFixed(2)} SAR (signed)`);
console.log(`│  Net Proceeds        :               = ${netSales.toFixed(2)} SAR`);
console.log('└───────────────────────────────────────────────────────────────┘\n');

// ── Fee rows — full detail ────────────────────────────────────────────────────

console.log('┌── FEE ROWS — RAW AUDIT ───────────────────────────────────────────────────────┐');
console.log(`│  Total fee rows parsed: ${feeRows.length}`);
console.log('└────────────────────────────────────────────────────────────────────────────────┘\n');

const COL = {
  desc:     32,
  txType:   14,
  rawExcl:  12,
  rawVat:   10,
  rawIncl:  12,
  absIncl:  12,
  credit:   8,
  cat:      18,
};

const hdr = [
  'Description'.padEnd(COL.desc),
  'TxType'.padEnd(COL.txType),
  'ExclVAT(raw)'.padStart(COL.rawExcl),
  'VAT(raw)'.padStart(COL.rawVat),
  'InclVAT(raw)'.padStart(COL.rawIncl),
  'InclVAT(abs)'.padStart(COL.absIncl),
  'Credit?'.padEnd(COL.credit),
  'Category'.padEnd(COL.cat),
].join(' │ ');

console.log(hdr);
console.log('─'.repeat(hdr.length));

for (const f of feeRows) {
  const flagCredit = f.isCredit ? '⚠ YES' : 'no';
  const flagWrong  = f.isCredit ? ' ← SIGN ISSUE' : '';
  const line = [
    f.description.slice(0, COL.desc - 1).padEnd(COL.desc),
    f.txType.padEnd(COL.txType),
    f.rawExclVat.toFixed(4).padStart(COL.rawExcl),
    f.rawVat.toFixed(4).padStart(COL.rawVat),
    f.rawInclVat.toFixed(4).padStart(COL.rawIncl),
    f.absInclVat.toFixed(4).padStart(COL.absIncl),
    flagCredit.padEnd(COL.credit),
    f.category.padEnd(COL.cat),
  ].join(' │ ');
  console.log(line + flagWrong);
}

// ── Aggregation by category ───────────────────────────────────────────────────

console.log('\n');
console.log('┌── FEE AGGREGATION BY CATEGORY (using Math.abs on inclVat) ───┐');

const catTotals: Record<string, { count: number; total: number; credits: number; creditTotal: number }> = {};
for (const f of feeRows) {
  if (!catTotals[f.category]) catTotals[f.category] = { count: 0, total: 0, credits: 0, creditTotal: 0 };
  catTotals[f.category].count++;
  catTotals[f.category].total += f.absInclVat;
  if (f.isCredit) {
    catTotals[f.category].credits++;
    catTotals[f.category].creditTotal += f.absInclVat;
  }
}

let grandTotal = 0;
for (const [cat, data] of Object.entries(catTotals)) {
  console.log(`│  ${cat.padEnd(20)} rows=${data.count}  total=${data.total.toFixed(2).padStart(8)}  credits=${data.credits}(${data.creditTotal.toFixed(2)})`);
  grandTotal += data.total;
}
console.log('├────────────────────────────────────────────────────────────────');
console.log(`│  TOTAL FEES (incl VAT, abs)           = ${grandTotal.toFixed(2).padStart(8)} SAR`);
console.log('└────────────────────────────────────────────────────────────────┘\n');

// ── Reconciliation vs Noon official ──────────────────────────────────────────

const NOON_OFFICIAL = {
  referralFee:  65.52,
  fbnFee:       233.00,
  returnFee:    0.90,
  totalFees:    299.42,
  netProceeds:  577.05,
};

const pfReferralFee = catTotals['referralFee']?.total    ?? 0;
const pfFbnFee      = catTotals['fbnOutboundFee']?.total ?? 0;
const pfReturnFee   = catTotals['returnFee']?.total      ?? 0;
const pfOtherFees   = Object.entries(catTotals)
  .filter(([cat]) => !['referralFee', 'fbnOutboundFee', 'returnFee'].includes(cat))
  .reduce((s, [, d]) => s + d.total, 0);
const pfTotalFees   = grandTotal;
const pfNetProceeds = netSales - pfTotalFees;

console.log('┌── RECONCILIATION: Noon Official vs PreciseFlow ────────────────┐');
console.log('│');
console.log(`│  ${'Category'.padEnd(22)} ${'Noon'.padStart(10)} ${'PreciseFlow'.padStart(12)} ${'Diff'.padStart(10)}`);
console.log(`│  ${'─'.repeat(58)}`);

const reconcLines = [
  { label: 'Net Proceeds (sales)',    noon: NOON_OFFICIAL.netProceeds,  pf: netSales },
  { label: 'Referral Fee',            noon: NOON_OFFICIAL.referralFee,  pf: pfReferralFee },
  { label: 'FBN Outbound Fee',        noon: NOON_OFFICIAL.fbnFee,       pf: pfFbnFee },
  { label: 'Return Administration',   noon: NOON_OFFICIAL.returnFee,    pf: pfReturnFee },
  { label: 'Other Fees',              noon: null,                        pf: pfOtherFees },
  { label: 'TOTAL FEES',              noon: NOON_OFFICIAL.totalFees,    pf: pfTotalFees },
  { label: 'Net After Fees',          noon: NOON_OFFICIAL.netProceeds - NOON_OFFICIAL.totalFees, pf: pfNetProceeds },
];

for (const row of reconcLines) {
  const diff     = row.noon !== null ? row.pf - row.noon : null;
  const noonStr  = row.noon !== null ? row.noon.toFixed(2) : '      N/A';
  const diffStr  = diff !== null ? (diff > 0.005 ? `+${diff.toFixed(2)} ⚠` : diff < -0.005 ? `${diff.toFixed(2)} ⚠` : '    0.00 ✓') : '    N/A';
  console.log(`│  ${row.label.padEnd(22)} ${noonStr.padStart(10)} ${row.pf.toFixed(2).padStart(12)} ${diffStr.padStart(10)}`);
}

console.log('│');
console.log('└────────────────────────────────────────────────────────────────┘\n');

// ── Credit rows investigation ─────────────────────────────────────────────────

const creditFeeRows = feeRows.filter(f => f.isCredit);
if (creditFeeRows.length > 0) {
  console.log('┌── ⚠ CREDIT FEE ROWS DETECTED (positive inclVat = Noon paying seller) ──────────┐');
  console.log('│  These rows have rawInclVat > 0. Math.abs() treats them as ADDITIONAL CHARGES.');
  console.log('│  If Noon intends these as credits (reducing seller fees), this causes OVERCOUNTING.\n');
  for (const f of creditFeeRows) {
    console.log(`│  [${f.category}] "${f.description}" rawInclVat=+${f.rawInclVat.toFixed(4)} abs=${f.absInclVat.toFixed(4)}`);
  }
  console.log('│');
  console.log(`│  Total credit amount treated as fees: ${creditFeeRows.reduce((s,f)=>s+f.absInclVat,0).toFixed(2)} SAR`);
  console.log('└────────────────────────────────────────────────────────────────────────────────┘\n');
} else {
  console.log('✓ No credit fee rows detected (all fee inclVat values are negative or zero).\n');
}

// ── Possible misclassifications ───────────────────────────────────────────────

console.log('┌── CLASSIFICATION CHECK ───────────────────────────────────────┐');
const returnAdminRows = feeRows.filter(f =>
  f.description.toLowerCase().includes('return') &&
  f.category !== 'returnFee'
);
if (returnAdminRows.length > 0) {
  console.log('│  ⚠ Rows containing "return" that were NOT classified as returnFee:');
  for (const f of returnAdminRows) {
    console.log(`│    "${f.description}" → classified as: ${f.category} (inclVat=${f.absInclVat.toFixed(4)})`);
  }
} else {
  console.log('│  ✓ All rows containing "return" are classified as returnFee.');
}

const referralRows = feeRows.filter(f => f.category === 'referralFee');
console.log(`│\n│  Referral Fee rows (${referralRows.length} total, PreciseFlow total=${pfReferralFee.toFixed(2)}):`);
for (const f of referralRows) {
  const flag = f.isCredit ? '  ← ⚠ CREDIT (should reduce fees)' : '';
  console.log(`│    "${f.description}" rawInclVat=${f.rawInclVat.toFixed(4)} abs=${f.absInclVat.toFixed(4)}${flag}`);
}
console.log('└────────────────────────────────────────────────────────────────┘\n');

// ── Transaction type breakdown ────────────────────────────────────────────────

console.log('┌── ALL TRANSACTION TYPES IN CSV ───────────────────────────────┐');
for (const [txType, count] of Object.entries(txTypeCounts).sort((a,b) => b[1]-a[1])) {
  console.log(`│  ${txType.padEnd(35)} : ${count}`);
}
console.log('└────────────────────────────────────────────────────────────────┘\n');

console.log('AUDIT COMPLETE.');
