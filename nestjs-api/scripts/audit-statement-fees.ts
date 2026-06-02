/**
 * Fee-row audit script — works for both Noon monthly and weekly CSV formats.
 *
 * Usage (from nestjs-api/):
 *   npx ts-node scripts/audit-statement-fees.ts "<path-to-csv>"
 */

import * as fs   from 'fs';
import * as path from 'path';

const { parse } = require('csv-parse/sync');

// ── delimiter detection ───────────────────────────────────────────────────────

function detectDelimiter(raw: string): string {
  const firstLine = raw.split(/\r?\n/)[0] ?? '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of firstLine) {
    if (ch in counts) (counts as any)[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

// ── strip BOM + normalize column name ────────────────────────────────────────

function norm(col: string): string {
  return col
    .replace(/^﻿/, '')       // BOM
    .replace(/[^\x20-\x7E]/g, '') // non-ASCII (hidden chars)
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toFloat(val: unknown): number {
  const s = String(val ?? '').replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function sanitize(val: unknown): string {
  if (val == null) return '';
  return String(val).trim().replace(/^﻿/, '').replace(/^[=+\-@\t\r]/, '').slice(0, 512);
}

function classifyFeeDescription(desc: string): string {
  const d = (desc ?? '').toLowerCase();
  if (d.includes('referral'))                                              return 'referralFee';
  if (d.includes('fbn outbound') || d.includes('fbn out'))                return 'fbnOutboundFee';
  if (d.includes('storage'))                                               return 'storageFee';
  if (d.includes('return administration') || d.includes('return admin'))  return 'returnFee';
  if (d.includes('damaged return') || d.includes('damaged item'))         return 'damageFee';
  if (d.includes('rtv') || d.includes('removal'))                         return 'removalFee';
  if (d.includes('compensation'))                                          return 'compensation';
  return 'other';
}

// ── known Noon official totals (update as needed) ────────────────────────────

const NOON_OFFICIAL = {
  netProceeds: 577.05,
  referralFee:  65.52,
  fbnFee:      233.00,
  returnFee:     0.90,
  totalFees:   299.42,
};

// ─────────────────────────────────────────────────────────────────────────────

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: npx ts-node scripts/audit-statement-fees.ts "<path-to-csv>"');
  process.exit(1);
}

const rawBuffer = fs.readFileSync(path.resolve(csvPath));
const rawStr    = rawBuffer.toString('utf8');
const delimiter = detectDelimiter(rawStr);

let rawRecords: Record<string, unknown>[];
try {
  rawRecords = parse(rawBuffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    delimiter,
    bom: true,
  }) as Record<string, unknown>[];
} catch (e) {
  console.error('CSV parse failed:', (e as Error).message);
  process.exit(1);
}

if (rawRecords.length === 0) {
  console.error('CSV is empty after parsing.');
  process.exit(1);
}

// Normalize all keys
const records = rawRecords.map(row => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[norm(k)] = v;
  return out;
});

const detectedCols = Object.keys(records[0]);

// ── format detection ──────────────────────────────────────────────────────────

const isMonthly = detectedCols.includes('transaction_type');
const isWeekly  = detectedCols.includes('fee_name') && detectedCols.includes('item_status');
const format    = isMonthly ? 'MONTHLY (transaction_type)' : isWeekly ? 'WEEKLY/SALES (fee_name)' : 'UNKNOWN';

const SEP = '═'.repeat(80);
const sep = '─'.repeat(80);

console.log(`\n${SEP}`);
console.log('  NOON STATEMENT FEE AUDIT REPORT');
console.log(`  File     : ${csvPath}`);
console.log(`  Delimiter: ${JSON.stringify(delimiter)}`);
console.log(`  Format   : ${format}`);
console.log(`  Rows     : ${records.length}`);
console.log(`${SEP}\n`);

console.log('DETECTED COLUMNS:');
detectedCols.forEach((c, i) => process.stdout.write(`  [${i.toString().padStart(2)}] ${c}\n`));
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY FORMAT AUDIT
// ─────────────────────────────────────────────────────────────────────────────

if (isWeekly) {
  interface OrderRow {
    idx:      number;
    orderNr:  string;
    itemNr:   string;
    feeName:  string;
    status:   string;
    sku:      string;
    netP:     number;
    ref:      number;   // raw, signed
    fbn:      number;   // raw, signed
    shp:      number;
    other:    number;
    total:    number;
    skipped:  boolean;
    skipReason: string;
  }

  const rows: OrderRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const r       = records[i];
    const orderNr = sanitize(r['order_nr']);
    const itemNr  = sanitize(r['item_nr']);
    const feeName = sanitize(r['fee_name']);
    const status  = sanitize(r['item_status']).toLowerCase();

    const row: OrderRow = {
      idx:       i + 1,
      orderNr,
      itemNr,
      feeName,
      status,
      sku:       sanitize(r['sku']),
      netP:      toFloat(r['net_proceeds']),
      ref:       toFloat(r['referral_fee']),
      fbn:       toFloat(r['fbn_outbound_fee']),
      shp:       toFloat(r['shipping_fee']),
      other:     toFloat(r['other_amounts']),
      total:     toFloat(r['total_payment']),
      skipped:   false,
      skipReason: '',
    };

    if (!orderNr && !itemNr) {
      row.skipped    = true;
      row.skipReason = 'empty order_nr AND item_nr → parser skips (if !orderNr || !rawItem) continue';
    }

    rows.push(row);
  }

  const skipped  = rows.filter(r => r.skipped);
  const included = rows.filter(r => !r.skipped);

  // ── print all rows ──────────────────────────────────────────────────────────

  console.log(`${'─'.repeat(130)}`);
  console.log(
    '#'.padStart(3) + ' │ ' +
    'fee_name'.padEnd(30) + ' │ ' +
    'status'.padEnd(10) + ' │ ' +
    'net_proceeds'.padStart(12) + ' │ ' +
    'referral_fee'.padStart(13) + ' │ ' +
    'fbn_fee'.padStart(10) + ' │ ' +
    'other'.padStart(7) + ' │ ' +
    'total_payment'.padStart(13) + ' │ ' +
    'included'.padStart(8) + ' │ NOTE'
  );
  console.log(`${'─'.repeat(130)}`);

  for (const r of rows) {
    const isCreditRef = r.ref > 0;
    const note = r.skipped
      ? `⛔ SKIPPED — ${r.skipReason}`
      : isCreditRef
        ? `⚠ ref CREDIT (+${r.ref.toFixed(4)}) — abs() adds as charge instead of credit`
        : '';

    const line = [
      r.idx.toString().padStart(3),
      '│',
      r.feeName.slice(0, 29).padEnd(30),
      '│',
      r.status.padEnd(10),
      '│',
      r.netP.toFixed(4).padStart(12),
      '│',
      (r.ref >= 0 ? '+' : '') + r.ref.toFixed(4).padStart(12),
      '│',
      r.fbn.toFixed(4).padStart(10),
      '│',
      r.other.toFixed(4).padStart(7),
      '│',
      r.total.toFixed(4).padStart(13),
      '│',
      (r.skipped ? 'NO' : 'YES').padStart(8),
      '│',
      note,
    ].join(' ');

    console.log(line);
  }
  console.log(`${'─'.repeat(130)}\n`);

  // ── aggregate ────────────────────────────────────────────────────────────────

  let gross = 0; let returns = 0;
  let refAllAbs = 0; let refDelivered = 0; let refReturned = 0;
  let fbnAll = 0;
  const creditRefRows = included.filter(r => r.ref > 0);

  for (const r of included) {
    if (r.status === 'delivered') { gross += r.netP; refDelivered += r.ref; }
    else if (r.status === 'returned') { returns += r.netP; refReturned += r.ref; }
    refAllAbs += Math.abs(r.ref);
    fbnAll    += Math.abs(r.fbn);
  }

  const netProceeds  = gross + returns;
  const missingTotal = skipped.reduce((s, r) => s + Math.abs(r.other) + Math.abs(r.ref) + Math.abs(r.fbn), 0);

  // ── summary ──────────────────────────────────────────────────────────────────

  console.log('┌── SKIPPED ROWS ──────────────────────────────────────────────────────┐');
  if (skipped.length === 0) {
    console.log('│  None.');
  } else {
    for (const r of skipped) {
      console.log(`│  Row ${r.idx}: fee_name=${JSON.stringify(r.feeName)} other_amounts=${r.other.toFixed(4)}`);
      console.log(`│           total_payment=${r.total.toFixed(4)}  Reason: ${r.skipReason}`);
    }
    console.log(`│\n│  Total fees LOST in skipped rows : ${missingTotal.toFixed(4)} SAR`);
  }
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌── CREDIT ROWS (positive fee value = Noon paying seller) ─────────────┐');
  if (creditRefRows.length === 0) {
    console.log('│  None detected.');
  } else {
    for (const r of creditRefRows) {
      const stored = parseFloat(Math.abs(r.ref).toFixed(2));
      console.log(`│  Row ${r.idx}: order=${r.orderNr}  status=${r.status}`);
      console.log(`│    referral_fee = +${r.ref.toFixed(4)} SAR (credit — Noon refunding commission)`);
      console.log(`│    abs(+${r.ref.toFixed(4)}) = ${Math.abs(r.ref).toFixed(4)} → stored toFixed(2) = ${stored}`);
      console.log(`│    Effect: adds ${stored} SAR as charge instead of subtracting it`);
      console.log(`│    Overcount = 2 × ${stored} = ${(2 * stored).toFixed(2)} SAR`);
    }
  }
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌── REVENUE ────────────────────────────────────────────────────────────┐');
  console.log(`│  Gross sales (delivered net_proceeds): ${gross.toFixed(4).padStart(10)} SAR`);
  console.log(`│  Returns (returned net_proceeds):      ${returns.toFixed(4).padStart(10)} SAR`);
  console.log(`│  Net Proceeds:                         ${netProceeds.toFixed(4).padStart(10)} SAR`);
  console.log(`│  Noon official:                        ${NOON_OFFICIAL.netProceeds.toFixed(2).padStart(10)} SAR  ${Math.abs(netProceeds - NOON_OFFICIAL.netProceeds) < 0.01 ? '✓' : '⚠ MISMATCH'}`);
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌── REFERRAL FEE DETAIL ────────────────────────────────────────────────┐');
  console.log(`│  Sum abs(referral_fee) ALL rows:          ${refAllAbs.toFixed(4).padStart(10)} SAR  ← PreciseFlow value`);
  console.log(`│  Sum referral_fee delivered (negative):   ${refDelivered.toFixed(4).padStart(10)} SAR`);
  console.log(`│  Sum referral_fee returned  (positive):  +${refReturned.toFixed(4).padStart(9)} SAR  ← credit`);
  console.log(`│  Correct net (charges - credits):         ${(Math.abs(refDelivered) - refReturned).toFixed(4).padStart(10)} SAR  ← what Noon shows`);
  console.log(`│  Noon official:                           ${NOON_OFFICIAL.referralFee.toFixed(2).padStart(10)} SAR`);
  console.log(`│  Difference (PF - Noon):                  ${(refAllAbs - NOON_OFFICIAL.referralFee).toFixed(4).padStart(10)} SAR`);
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌── FBN OUTBOUND FEE ───────────────────────────────────────────────────┐');
  console.log(`│  Sum abs(fbn_outbound_fee):  ${fbnAll.toFixed(4).padStart(10)} SAR`);
  console.log(`│  Noon official:              ${NOON_OFFICIAL.fbnFee.toFixed(2).padStart(10)} SAR  ${Math.abs(fbnAll - NOON_OFFICIAL.fbnFee) < 0.01 ? '✓' : '⚠ MISMATCH'}`);
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  // ── reconciliation table ────────────────────────────────────────────────────

  const pfTotalFees = refAllAbs + fbnAll;

  console.log('╔══ RECONCILIATION TABLE ════════════════════════════════════════════════╗');
  console.log('║');
  console.log('║  ' + 'Category'.padEnd(26) + ' ' + 'Noon Expected'.padStart(14) + ' ' + 'PreciseFlow'.padStart(13) + ' ' + 'Difference'.padStart(12));
  console.log('║  ' + '─'.repeat(67));

  const recon = [
    { label: 'Net Proceeds',           noon: NOON_OFFICIAL.netProceeds, pf: netProceeds },
    { label: 'Referral Fee',           noon: NOON_OFFICIAL.referralFee, pf: refAllAbs },
    { label: 'FBN Outbound Fee',       noon: NOON_OFFICIAL.fbnFee,      pf: fbnAll },
    { label: 'Return Admin Fee',       noon: NOON_OFFICIAL.returnFee,   pf: missingTotal },
    { label: 'TOTAL FEES',             noon: NOON_OFFICIAL.totalFees,   pf: pfTotalFees + missingTotal },
    { label: 'Net After Fees',         noon: NOON_OFFICIAL.netProceeds - NOON_OFFICIAL.totalFees,
                                       pf:   netProceeds - pfTotalFees },
  ];

  for (const row of recon) {
    const diff     = row.pf - row.noon;
    const diffStr  = Math.abs(diff) < 0.005 ? '         ✓  ' : `${diff > 0 ? '+' : ''}${diff.toFixed(4)}  ⚠`;
    console.log(`║  ${row.label.padEnd(26)} ${row.noon.toFixed(2).padStart(14)} ${row.pf.toFixed(4).padStart(13)} ${diffStr.padStart(12)}`);
  }

  console.log('║');
  console.log('╠══ ROOT CAUSE SUMMARY ══════════════════════════════════════════════════╣');
  console.log('║');
  console.log('║  CAUSE 1 (+9.00 SAR excess in Referral Fee):');
  console.log('║    Returned order referral commission (credit +4.4991 SAR) has Math.abs()');
  console.log('║    applied, which adds it as an additional CHARGE instead of subtracting.');
  console.log('║    Fix: do NOT use Math.abs() on positive (credit) fee values for returned orders.');
  console.log('║    Use: abs(charges) - credits  instead of abs(all values)');
  console.log('║');
  console.log('║  CAUSE 2 (-0.90 SAR missing from Return Admin Fee):');
  console.log('║    Row 1 (fee_name="Return Administration Fee") has empty order_nr.');
  console.log('║    Parser condition: if (!orderNr || !rawItem) continue  → ROW SKIPPED.');
  console.log('║    Fix: rows with fee_name != "Order" and empty order_nr are statement fees,');
  console.log('║    they should be captured in statementFees, not skipped.');
  console.log('║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY FORMAT AUDIT
// ─────────────────────────────────────────────────────────────────────────────

} else if (isMonthly) {

  const customerRows: { docType: string; inclVat: number; orderNr: string }[] = [];
  const feeRows: { idx: number; txType: string; desc: string; rawExcl: number; rawVat: number; rawIncl: number; cat: string; isCredit: boolean }[] = [];
  const txCounts: Record<string, number> = {};

  for (let i = 0; i < records.length; i++) {
    const r      = records[i];
    const txType = sanitize(r['transaction_type']);
    txCounts[txType] = (txCounts[txType] ?? 0) + 1;

    if (txType === 'Customer') {
      const docType = sanitize(r['document_type']);
      if (docType === 'Invoice' || docType === 'Creditnote') {
        customerRows.push({ docType, inclVat: toFloat(r['price_including_vat_document_currency']), orderNr: sanitize(r['source_doc_nr']) });
      }
    } else if (txType === 'Statement Fee' || txType === 'Service Fee') {
      const rawIncl = toFloat(r['price_including_vat_document_currency']);
      const rawVat  = toFloat(r['vat_amount_document_currency']);
      const rawExcl = toFloat(r['price_excluding_vat_document_currency']) || rawIncl - rawVat;
      const desc    = sanitize(r['description']);
      feeRows.push({ idx: i + 1, txType, desc, rawExcl, rawVat, rawIncl, cat: classifyFeeDescription(desc), isCredit: rawIncl > 0 });
    }
  }

  console.log('TRANSACTION TYPE COUNTS:');
  for (const [t, n] of Object.entries(txCounts)) console.log(`  ${t.padEnd(30)}: ${n}`);
  console.log();

  const gross   = customerRows.filter(r => r.docType === 'Invoice').reduce((s, r) => s + r.inclVat, 0);
  const returns = customerRows.filter(r => r.docType === 'Creditnote').reduce((s, r) => s + r.inclVat, 0);

  console.log(`  Customer rows: ${customerRows.length}   (invoices=${gross.toFixed(2)}  creditnotes=${returns.toFixed(2)}  net=${(gross + returns).toFixed(2)})`);
  console.log(`  Fee rows     : ${feeRows.length}`);
  console.log();

  const hdr = ['#'.padStart(3), 'TxType'.padEnd(14), 'Description'.padEnd(34),
    'ExclVAT(raw)'.padStart(13), 'VAT(raw)'.padStart(9), 'InclVAT(raw)'.padStart(13),
    'InclVAT(abs)'.padStart(13), 'Credit?'.padEnd(8), 'Category'.padEnd(18)].join(' │ ');
  console.log(hdr);
  console.log('─'.repeat(hdr.length));

  for (const f of feeRows) {
    const line = [f.idx.toString().padStart(3), f.txType.padEnd(14), f.desc.slice(0, 33).padEnd(34),
      f.rawExcl.toFixed(4).padStart(13), f.rawVat.toFixed(4).padStart(9), f.rawIncl.toFixed(4).padStart(13),
      Math.abs(f.rawIncl).toFixed(4).padStart(13), (f.isCredit ? '⚠ YES' : 'no').padEnd(8), f.cat].join(' │ ');
    console.log(line + (f.isCredit ? '  ← SIGN ISSUE' : ''));
  }

  const catTotals: Record<string, number> = {};
  let grandTotal = 0;
  for (const f of feeRows) {
    catTotals[f.cat] = (catTotals[f.cat] ?? 0) + Math.abs(f.rawIncl);
    grandTotal += Math.abs(f.rawIncl);
  }

  console.log('\nFEE TOTALS BY CATEGORY (abs):');
  for (const [cat, total] of Object.entries(catTotals)) {
    console.log(`  ${cat.padEnd(20)}: ${total.toFixed(4)} SAR`);
  }
  console.log(`  ${'TOTAL'.padEnd(20)}: ${grandTotal.toFixed(4)} SAR`);

} else {
  console.log('⚠ UNKNOWN FORMAT — could not detect transaction_type or fee_name columns.');
  console.log('Detected columns:', detectedCols);
}

console.log('\nAUDIT COMPLETE.\n');
