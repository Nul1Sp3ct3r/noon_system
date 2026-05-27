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

export interface FeeRow {
  feeType: string;
  description: string;
  exclVat: number;
  vatAmount: number;
  inclVat: number;
  statementNr: string;
  statementDate: string;
}

export interface ParsedCsv {
  customerRows: CustomerRow[];
  feeRows: FeeRow[];
  statementNr: string;
  statementDate: string;
}

export interface ImportResult {
  batchId: string;
  rowsImported: number;
  rowsSkipped: number;
  salesCount: number;
  returnsCount: number;
  feesCount: number;
  warnings: string[];
}
