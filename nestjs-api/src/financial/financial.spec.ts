import { Test, TestingModule } from '@nestjs/testing';
import { FinancialSummaryService } from './financial.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Real verified statement data ──────────────────────────────────────────────
// Source: PS-288625-SA202605xx statements
const STATEMENTS = [
  { referenceNr: 'PS-288625-SA20260513', statementDate: '2026-05-13', netProceeds: 653.07,  feesExclVat: 297.82, statementVat: 44.67,  netAfterVat: 310.58 },
  { referenceNr: 'PS-288625-SA20260520', statementDate: '2026-05-20', netProceeds: 809.14,  feesExclVat: 312.28, statementVat: 46.84,  netAfterVat: 450.02 },
  { referenceNr: 'PS-288625-SA20260527', statementDate: '2026-05-27', netProceeds: 896.51,  feesExclVat: 317.97, statementVat: 47.70,  netAfterVat: 530.84 },
  { referenceNr: 'PS-288625-SA20260604', statementDate: '2026-06-04', netProceeds: 1267.74, feesExclVat: 484.87, statementVat: 72.73,  netAfterVat: 710.14 },
];

// May 2026 = first 3 statements
const MAY_STMTS   = STATEMENTS.slice(0, 3);
const JUNE_STMTS  = STATEMENTS.slice(3);

describe('FinancialSummaryService', () => {
  let service: FinancialSummaryService;
  let prisma:  jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      order: {
        aggregate:  jest.fn(),
        findMany:   jest.fn(),
      },
      noonStatementSummary: {
        findMany: jest.fn(),
      },
      statementFee: {
        findMany: jest.fn(),
      },
      invoiceItem: {
        aggregate: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialSummaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(FinancialSummaryService);
    prisma  = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // ── Helper: build consistent mocks for a given statement set ────────────────
  function setupMocks(stmts: typeof STATEMENTS, extraParams: {
    deliveredOrders?: Array<{ sku: string | null }>;
    returnedOrders?:  number;  // total returns amount
    cogs?:            number;
    supplierVat?:     number;
    vatRegistered?:   boolean;
    profitMode?:      string;
  } = {}) {
    const totalDeliveredProceeds = stmts.reduce((s, x) => s + x.netProceeds, 0);
    const returnsTotal = extraParams.returnedOrders ?? 0;
    const deliveredOrders = extraParams.deliveredOrders ?? [];

    (prisma.order.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { netProceeds: totalDeliveredProceeds }, _count: { _all: stmts.length } })  // delivered
      .mockResolvedValueOnce({ _sum: { netProceeds: -returnsTotal }, _count: { _all: 0 } });  // returned

    (prisma.order.findMany as jest.Mock).mockResolvedValue(deliveredOrders);

    (prisma.noonStatementSummary.findMany as jest.Mock).mockResolvedValue(
      stmts.map(s => ({
        feesExclVat:  s.feesExclVat,
        statementVat: s.statementVat,
        statementDate: s.statementDate,
      })),
    );

    (prisma.statementFee.findMany as jest.Mock).mockResolvedValue([]);

    (prisma.invoiceItem.aggregate as jest.Mock).mockResolvedValue({
      _sum: { lineVat: extraParams.supplierVat ?? 0 },
    });

    (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
      vatRegistered: extraParams.vatRegistered ?? false,
      profitMode:    extraParams.profitMode    ?? 'expense',
    });
  }

  // ── Test: May 2026 aggregate ─────────────────────────────────────────────────
  it('calculates correct May 2026 totals from 3 TV statements', async () => {
    setupMocks(MAY_STMTS);

    const result = await service.getSummary(1, { year: 2026, month: '2026-05' });

    // netSales = sum of netProceeds (no returns in this test)
    const expectedNetSales = 653.07 + 809.14 + 896.51;  // 2358.72
    expect(result.grossSales).toBeCloseTo(expectedNetSales, 1);
    expect(result.returns).toBe(0);
    expect(result.netSales).toBeCloseTo(expectedNetSales, 1);

    // fees
    const expectedFeesExcl = 297.82 + 312.28 + 317.97;  // 928.07
    const expectedVat       = 44.67  + 46.84  + 47.70;   // 139.21
    expect(result.feesBeforeVAT).toBeCloseTo(expectedFeesExcl, 1);
    expect(result.vatOnFees).toBeCloseTo(expectedVat, 1);
    expect(result.totalFees).toBeCloseTo(expectedFeesExcl + expectedVat, 1);  // 1067.28

    // profits (no COGS)
    expect(result.operationalProfit).toBeCloseTo(expectedNetSales - expectedFeesExcl, 1);   // 1430.65
    expect(result.accountingProfit).toBeCloseTo(expectedNetSales - (expectedFeesExcl + expectedVat), 1); // 1291.44

    // VAT position (no supplier VAT)
    const expectedOutputVAT  = Math.round(expectedNetSales * (15 / 115) * 100) / 100;
    expect(result.outputVAT).toBeCloseTo(expectedOutputVAT, 1);
    expect(result.inputVATNoon).toBeCloseTo(expectedVat, 1);
    expect(result.vatPayable).toBeCloseTo(expectedOutputVAT - expectedVat, 1);
  });

  // ── Test: June 2026 single statement ─────────────────────────────────────────
  it('calculates correct June 2026 totals from 1 TV statement', async () => {
    setupMocks(JUNE_STMTS);

    const result = await service.getSummary(1, { year: 2026, month: '2026-06' });

    expect(result.netSales).toBeCloseTo(1267.74, 1);
    expect(result.feesBeforeVAT).toBeCloseTo(484.87, 1);
    expect(result.vatOnFees).toBeCloseTo(72.73, 1);
    expect(result.accountingProfit).toBeCloseTo(710.14, 1);  // matches netAfterVat
  });

  // ── Test: COGS reduces profit ─────────────────────────────────────────────────
  it('subtracts COGS from profit correctly', async () => {
    const cogsPerUnit = 50;
    const numUnits    = 3;

    (prisma.order.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { netProceeds: 653.07 }, _count: { _all: 3 } })
      .mockResolvedValueOnce({ _sum: { netProceeds: 0 },      _count: { _all: 0 } });

    (prisma.order.findMany as jest.Mock).mockResolvedValue(
      Array(numUnits).fill({ sku: 'SKU-001' }),
    );
    (prisma.noonStatementSummary.findMany as jest.Mock).mockResolvedValue([MAY_STMTS[0]].map(s => ({
      feesExclVat: s.feesExclVat, statementVat: s.statementVat, statementDate: s.statementDate,
    })));
    (prisma.statementFee.findMany   as jest.Mock).mockResolvedValue([]);
    (prisma.invoiceItem.aggregate   as jest.Mock).mockResolvedValue({ _sum: { lineVat: 0 } });
    (prisma.product.findMany        as jest.Mock).mockResolvedValue([
      { sku: 'SKU-001', unitCost: cogsPerUnit, extraCosts: 0, costIncludesVat: false },
    ]);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ vatRegistered: false, profitMode: 'expense' });

    const result = await service.getSummary(1, { month: '2026-05' });
    const expectedCogs = cogsPerUnit * numUnits;
    expect(result.cogs).toBeCloseTo(expectedCogs, 2);
    expect(result.accountingProfit).toBeCloseTo(result.netSales - result.totalFees - expectedCogs, 1);
  });

  // ── Test: VAT-registered merchant uses operationalProfit ─────────────────────
  it('returns operationalProfit as activeProfit when VAT registered + recoverable', async () => {
    setupMocks(MAY_STMTS, { vatRegistered: true, profitMode: 'recoverable' });
    const result = await service.getSummary(1, {});
    expect(result.activeProfit).toBe(result.operationalProfit);
  });

  // ── Test: Non-VAT merchant uses accountingProfit ──────────────────────────────
  it('returns accountingProfit as activeProfit when NOT VAT registered', async () => {
    setupMocks(MAY_STMTS, { vatRegistered: false, profitMode: 'expense' });
    const result = await service.getSummary(1, {});
    expect(result.activeProfit).toBe(result.accountingProfit);
  });

  // ── Test: accounting identities hold ─────────────────────────────────────────
  it('all accounting identities hold (no rounding drift > 0.01)', async () => {
    setupMocks(STATEMENTS);
    const r = await service.getSummary(1, {});

    expect(Math.abs(r.netSales - (r.grossSales - r.returns))).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.totalFees - (r.feesBeforeVAT + r.vatOnFees))).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.operationalProfit - (r.netSales - r.feesBeforeVAT - r.cogs))).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.accountingProfit  - (r.netSales - r.totalFees     - r.cogs))).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.vatPayable - (r.outputVAT - r.inputVATNoon - r.inputVATSuppliers))).toBeLessThanOrEqual(0.01);
  });

  // ── Test: supplementary fees added correctly ──────────────────────────────────
  it('adds storage fees from monthly without double-counting referral fees', async () => {
    const storageExcl = 50;
    const storageVat  = 7.5;

    (prisma.order.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { netProceeds: 653.07 }, _count: { _all: 1 } })
      .mockResolvedValueOnce({ _sum: { netProceeds: 0 },      _count: { _all: 0 } });
    (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.noonStatementSummary.findMany as jest.Mock).mockResolvedValue([
      { feesExclVat: MAY_STMTS[0].feesExclVat, statementVat: MAY_STMTS[0].statementVat, statementDate: MAY_STMTS[0].statementDate },
    ]);
    // Monthly added a storage fee AND a referral fee row — referral should be ignored
    (prisma.statementFee.findMany as jest.Mock).mockResolvedValue([
      { exclVat: storageExcl, vatAmount: storageVat, description: 'Storage Fee', category: 'storageFee', statementDate: '2026-05-13' },
      { exclVat: 100,         vatAmount: 15,         description: 'Referral Fee', category: 'referralFee', statementDate: '2026-05-13' },
    ]);
    (prisma.invoiceItem.aggregate   as jest.Mock).mockResolvedValue({ _sum: { lineVat: 0 } });
    (prisma.product.findMany        as jest.Mock).mockResolvedValue([]);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ vatRegistered: false, profitMode: 'expense' });

    const result = await service.getSummary(1, { month: '2026-05' });

    // feesBeforeVAT = TV fees + storage (NOT referral)
    const expected = Math.round((MAY_STMTS[0].feesExclVat + storageExcl) * 100) / 100;
    expect(result.feesBeforeVAT).toBeCloseTo(expected, 1);
  });

  // ── Test: monthly-only mode (no TV data) uses all StatementFee rows ───────────
  it('uses all StatementFee rows when no TV summaries exist', async () => {
    const referralExcl = 100;
    const referralVat  = 15;

    (prisma.order.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { netProceeds: 500 }, _count: { _all: 2 } })
      .mockResolvedValueOnce({ _sum: { netProceeds: 0 },   _count: { _all: 0 } });
    (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.noonStatementSummary.findMany as jest.Mock).mockResolvedValue([]);  // no TV data
    (prisma.statementFee.findMany as jest.Mock).mockResolvedValue([
      { exclVat: referralExcl, vatAmount: referralVat, description: 'Referral Fee', category: 'referralFee', statementDate: '2026-04-01' },
    ]);
    (prisma.invoiceItem.aggregate   as jest.Mock).mockResolvedValue({ _sum: { lineVat: 0 } });
    (prisma.product.findMany        as jest.Mock).mockResolvedValue([]);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ vatRegistered: false, profitMode: 'expense' });

    const result = await service.getSummary(1, { year: 2026 });
    // All fees including referral should be included (monthly-only mode)
    expect(result.feesBeforeVAT).toBeCloseTo(referralExcl, 2);
    expect(result.vatOnFees).toBeCloseTo(referralVat, 2);
  });

  // ── Test: reconcile returns ok when identities hold ───────────────────────────
  it('reconcile returns ok=true when monthly sums match yearly total', async () => {
    // Mock getSummary and getMonthlySummaries to return consistent data
    const spy = jest.spyOn(service, 'getSummary');
    const spyMonthly = jest.spyOn(service, 'getMonthlySummaries');

    const mockSummary = {
      grossSales: 2358.72, returns: 0, netSales: 2358.72,
      feesBeforeVAT: 928.07, vatOnFees: 139.21, totalFees: 1067.28,
      cogs: 0, operationalProfit: 1430.65, accountingProfit: 1291.44,
      outputVAT: 307.79, inputVATNoon: 139.21, inputVATSuppliers: 0, vatPayable: 168.58,
      deliveredCount: 3, returnedCount: 0, statementCount: 3,
      vatRegistered: false, profitMode: 'expense',
      activeProfit: 1291.44, marginPct: 54.77,
    };

    spy.mockResolvedValue(mockSummary);
    spyMonthly.mockResolvedValue([{ ...mockSummary, month: '2026-05' }]);

    const result = await service.reconcile(1, 2026);
    expect(result.ok).toBe(true);
    expect(result.discrepancies).toHaveLength(0);
    expect(result.identityErrors).toHaveLength(0);
  });
});
