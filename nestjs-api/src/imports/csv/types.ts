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
  productTitleEn: string;
  itemStatus: string;
  orderedDate: string;
  netProceeds: number;
  referralFee: number;
  fbnOutboundFee: number;
  totalPayment: number;
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
  format: 'monthly' | 'old';
  customerRows: CustomerRow[];
  oldRows: OldRow[];
  feeRows: FeeRow[];
  statementNr: string;
  statementDate: string;
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
