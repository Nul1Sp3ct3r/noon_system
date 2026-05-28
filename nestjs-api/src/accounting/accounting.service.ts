import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';

// Well-known account codes used by auto-generation
const AC = {
  BANK:         '1110',
  CASH:         '1120',
  INVENTORY:    '1130',
  NOON_AR:      '1140',  // ذمم نون المدينة
  INPUT_VAT:    '1150',
  AP:           '2110',  // الموردون
  VAT_PAYABLE:  '2120',
  NOON_SALES:   '4100',
  NOON_FEES:    '5100',
  COGS:         '5200',
  INV_VARIANCE: '5600',
};

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private prisma: PrismaService,
    private accountsSvc: AccountsService,
  ) {}

  // ─── Trial Balance ────────────────────────────────────────────────────────────

  async getTrialBalance(orgId: number, params: { from?: string; to?: string }) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { code: 'asc' },
    });

    const lineWhere: any = {
      journal: {
        organizationId: orgId,
        status: 'posted',
        ...(params.from || params.to
          ? { entryDate: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
          : {}),
      },
    };

    const rows = await Promise.all(
      accounts.map(async acc => {
        const agg = await this.prisma.journalLine.aggregate({
          where: { ...lineWhere, accountId: acc.id },
          _sum: { debit: true, credit: true },
        });
        const debit  = Number(agg._sum.debit  ?? 0);
        const credit = Number(agg._sum.credit ?? 0);
        const balance = debit - credit;
        return { account: acc, debit, credit, balance };
      }),
    );

    const totalDebit  = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const balanced    = Math.abs(totalDebit - totalCredit) < 0.01;

    return { rows: rows.filter(r => r.debit > 0 || r.credit > 0), totalDebit, totalCredit, balanced };
  }

  // ─── General Ledger ────────────────────────────────────────────────────────────

  async getLedger(orgId: number, accountId: number, params: { from?: string; to?: string }) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new NotFoundException('Account not found');

    const journalWhere: any = {
      organizationId: orgId,
      status: 'posted',
      ...(params.from || params.to
        ? { entryDate: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
        : {}),
    };

    const lines = await this.prisma.journalLine.findMany({
      where: { accountId, journal: journalWhere },
      include: { journal: { select: { id: true, journalNumber: true, entryDate: true, description: true, reference: true, sourceType: true } } },
      orderBy: [{ journal: { entryDate: 'asc' } }, { journal: { id: 'asc' } }, { id: 'asc' }],
    });

    // Compute running balance
    let running = 0;
    const entries = lines.map(l => {
      const debit  = Number(l.debit);
      const credit = Number(l.credit);
      running += debit - credit;
      return { ...l, debit, credit, runningBalance: running };
    });

    const totalDebit  = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    return { account, entries, totalDebit, totalCredit, closingBalance: running };
  }

  // ─── Period Management ────────────────────────────────────────────────────────

  async getPeriods(orgId: number) {
    return this.prisma.accountingPeriod.findMany({
      where: { organizationId: orgId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      include: { closedBy: { select: { id: true, fullName: true, username: true } } },
    });
  }

  async togglePeriod(orgId: number, year: number, month: number, close: boolean, userId: number) {
    const existing = await this.prisma.accountingPeriod.findUnique({
      where: { organizationId_periodYear_periodMonth: { organizationId: orgId, periodYear: year, periodMonth: month } },
    });

    if (existing) {
      return this.prisma.accountingPeriod.update({
        where: { id: existing.id },
        data: {
          isClosed:  close,
          closedAt:  close ? new Date() : null,
          closedById: close ? userId : null,
        },
      });
    }

    return this.prisma.accountingPeriod.create({
      data: {
        organizationId: orgId,
        periodYear:     year,
        periodMonth:    month,
        isClosed:       close,
        closedAt:       close ? new Date() : null,
        closedById:     close ? userId : null,
      },
    });
  }

  async isPeriodLocked(orgId: number, entryDate: string): Promise<boolean> {
    const [year, month] = entryDate.split('-').map(Number);
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { organizationId_periodYear_periodMonth: { organizationId: orgId, periodYear: year, periodMonth: month } },
    });
    return period?.isClosed ?? false;
  }

  // ─── Journal Templates ────────────────────────────────────────────────────────

  async getTemplates(orgId: number) {
    return this.prisma.journalTemplate.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async seedTemplates(orgId: number) {
    const count = await this.prisma.journalTemplate.count({ where: { organizationId: orgId } });
    if (count > 0) return { seeded: false };

    const codeMap = await this.accountsSvc.getCodeMap(orgId);
    const get = (code: string) => {
      const acc = codeMap.get(code);
      return acc ? { accountId: acc.id, accountAr: acc.nameAr } : { accountId: null, accountAr: code };
    };

    const templates = [
      {
        name: 'مبيعات نون',
        description: 'قيد مبيعات — ذمم نون مدين، إيرادات دائن',
        templateLines: [
          { ...get(AC.NOON_AR),    side: 'debit',  notes: 'ذمم نون المدينة' },
          { ...get(AC.NOON_SALES), side: 'credit', notes: 'إيرادات مبيعات نون' },
        ],
      },
      {
        name: 'رسوم نون',
        description: 'قيد رسوم — رسوم مدين، ذمم نون دائن',
        templateLines: [
          { ...get(AC.NOON_FEES), side: 'debit',  notes: 'رسوم نون' },
          { ...get(AC.NOON_AR),   side: 'credit', notes: 'خصم من ذمم نون' },
        ],
      },
      {
        name: 'تسوية نون (تحصيل)',
        description: 'استلام دفعة من نون — بنك مدين، ذمم نون دائن',
        templateLines: [
          { ...get(AC.BANK),    side: 'debit',  notes: 'استلام دفعة نون' },
          { ...get(AC.NOON_AR), side: 'credit', notes: 'تسوية ذمم نون' },
        ],
      },
      {
        name: 'فاتورة مورد',
        description: 'شراء مخزون — مخزون مدين، موردون دائن',
        templateLines: [
          { ...get(AC.INVENTORY), side: 'debit',  notes: 'شراء بضاعة' },
          { ...get(AC.AP),        side: 'credit', notes: 'مديونية للمورد' },
        ],
      },
      {
        name: 'دفع للمورد',
        description: 'سداد فاتورة مورد — موردون مدين، بنك دائن',
        templateLines: [
          { ...get(AC.AP),   side: 'debit',  notes: 'سداد مورد' },
          { ...get(AC.BANK), side: 'credit', notes: 'صرف من البنك' },
        ],
      },
      {
        name: 'تكلفة البضاعة المباعة',
        description: 'تحميل تكلفة المبيعات',
        templateLines: [
          { ...get(AC.COGS),      side: 'debit',  notes: 'تكلفة البضاعة' },
          { ...get(AC.INVENTORY), side: 'credit', notes: 'خروج بضاعة من المخزون' },
        ],
      },
      {
        name: 'فرق مخزون',
        description: 'تسوية فرق المخزون من الجرد',
        templateLines: [
          { ...get(AC.INV_VARIANCE), side: 'debit',  notes: 'عجز في المخزون' },
          { ...get(AC.INVENTORY),    side: 'credit', notes: 'خروج فرق مخزون' },
        ],
      },
    ];

    await this.prisma.journalTemplate.createMany({
      data: templates.map(t => ({
        organizationId: orgId,
        name:           t.name,
        description:    t.description,
        templateLines:  t.templateLines as any,
        isSystem:       true,
      })),
    });

    return { seeded: true, count: templates.length };
  }

  // ─── Auto-generation ──────────────────────────────────────────────────────────

  async generateFromInvoice(invoiceId: number, orgId: number, createdById?: number) {
    try {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        include: { items: true },
      });
      if (!invoice || !invoice.totalAmount) return null;

      const codeMap = await this.accountsSvc.getCodeMap(orgId);
      const inventory = codeMap.get(AC.INVENTORY);
      const ap        = codeMap.get(AC.AP);
      const inputVat  = codeMap.get(AC.INPUT_VAT);
      if (!inventory || !ap) return null;

      const total    = Number(invoice.totalAmount);
      const vatAmt   = Number(invoice.vatAmount ?? 0);
      const subtotal = total - vatAmt;

      const lines: any[] = [
        {
          accountId: inventory.id,
          accountAr: inventory.nameAr,
          debit:     subtotal,
          credit:    0,
          notes:     `فاتورة ${invoice.invoiceNumber ?? invoice.id}`,
        },
      ];

      if (vatAmt > 0 && inputVat) {
        lines.push({
          accountId: inputVat.id,
          accountAr: inputVat.nameAr,
          debit:     vatAmt,
          credit:    0,
          notes:     'ضريبة مدخلات',
        });
      }

      lines.push({
        accountId: ap.id,
        accountAr: ap.nameAr,
        debit:     0,
        credit:    total,
        notes:     invoice.supplierName ?? 'مورد',
      });

      return this.prisma.journalEntry.create({
        data: {
          organizationId: orgId,
          journalNumber:  await this.nextJournalNumber(orgId),
          entryDate:      invoice.invoiceDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          description:    `فاتورة مورد: ${invoice.supplierName ?? ''} ${invoice.invoiceNumber ?? ''}`.trim(),
          reference:      invoice.invoiceNumber ?? undefined,
          status:         'posted',
          sourceType:     'invoice',
          sourceId:       String(invoiceId),
          createdById:    createdById ?? null,
          lines:          { create: lines },
        },
        include: { lines: true },
      });
    } catch (err) {
      this.logger.warn(`Auto-generate from invoice ${invoiceId} failed: ${err}`);
      return null;
    }
  }

  async generateFromAdjustment(movementId: number, orgId: number, createdById?: number) {
    try {
      const mov = await this.prisma.inventoryMovement.findFirst({
        where: { id: movementId, organizationId: orgId },
        include: { product: true },
      });
      if (!mov) return null;

      const codeMap   = await this.accountsSvc.getCodeMap(orgId);
      const inventory = codeMap.get(AC.INVENTORY);
      const variance  = codeMap.get(AC.INV_VARIANCE);
      if (!inventory || !variance) return null;

      const qty  = Math.abs(mov.quantity);
      const cost = mov.product?.unitCost ? Number(mov.product.unitCost) : 0;
      if (cost === 0) return null;

      const amount = qty * cost;
      const isIncrease = mov.quantity > 0;

      const lines = isIncrease
        ? [
            { accountId: inventory.id, accountAr: inventory.nameAr, debit: amount, credit: 0,      notes: `تسوية مخزون ${mov.sku}` },
            { accountId: variance.id,  accountAr: variance.nameAr,  debit: 0,      credit: amount, notes: 'فرق مخزون' },
          ]
        : [
            { accountId: variance.id,  accountAr: variance.nameAr,  debit: amount, credit: 0,      notes: 'فرق مخزون' },
            { accountId: inventory.id, accountAr: inventory.nameAr, debit: 0,      credit: amount, notes: `تسوية مخزون ${mov.sku}` },
          ];

      return this.prisma.journalEntry.create({
        data: {
          organizationId: orgId,
          journalNumber:  await this.nextJournalNumber(orgId),
          entryDate:      mov.createdAt.toISOString().slice(0, 10),
          description:    `تسوية مخزون: ${mov.sku} (${mov.quantity > 0 ? '+' : ''}${mov.quantity})`,
          reference:      mov.reference ?? undefined,
          status:         'posted',
          sourceType:     'inventory_adjustment',
          sourceId:       String(movementId),
          createdById:    createdById ?? null,
          lines:          { create: lines },
        },
        include: { lines: true },
      });
    } catch (err) {
      this.logger.warn(`Auto-generate from adjustment ${movementId} failed: ${err}`);
      return null;
    }
  }

  async generateFromImportBatch(batchId: string, orgId: number, createdById?: number) {
    try {
      const batch = await this.prisma.importBatch.findFirst({
        where: { batchId, organizationId: orgId },
      });
      if (!batch) return null;

      // Aggregate totals from this batch
      const salesAgg = await this.prisma.order.aggregate({
        where: { organizationId: orgId, importBatch: batchId, itemStatus: { in: ['delivered', 'Delivered'] } },
        _sum: { netProceeds: true, referralFee: true, fbnOutboundFee: true },
      });

      const feesAgg = await this.prisma.statementFee.aggregate({
        where: { organizationId: orgId, importBatch: batchId },
        _sum: { exclVat: true, vatAmount: true },
      });

      const netProceeds  = Number(salesAgg._sum.netProceeds  ?? 0);
      const referralFees = Number(salesAgg._sum.referralFee  ?? 0);
      const fbnFees      = Number(salesAgg._sum.fbnOutboundFee ?? 0);
      const stmtFees     = Number(feesAgg._sum.exclVat ?? 0);
      const stmtVat      = Number(feesAgg._sum.vatAmount ?? 0);

      if (netProceeds === 0 && referralFees === 0) return null;

      const codeMap   = await this.accountsSvc.getCodeMap(orgId);
      const noonAR    = codeMap.get(AC.NOON_AR);
      const sales     = codeMap.get(AC.NOON_SALES);
      const fees      = codeMap.get(AC.NOON_FEES);
      const inputVat  = codeMap.get(AC.INPUT_VAT);
      if (!noonAR || !sales || !fees) return null;

      const totalFees    = referralFees + fbnFees + stmtFees;
      const grossRevenue = netProceeds + totalFees + stmtVat;
      const entryDate    = batch.statementDate ?? batch.createdAt.toISOString().slice(0, 10);

      const lines: any[] = [
        { accountId: noonAR.id, accountAr: noonAR.nameAr, debit: grossRevenue, credit: 0, notes: 'ذمم نون' },
        { accountId: sales.id,  accountAr: sales.nameAr,  debit: 0, credit: netProceeds + totalFees, notes: 'إيرادات مبيعات' },
      ];

      if (stmtVat > 0 && inputVat) {
        lines.push({ accountId: inputVat.id, accountAr: inputVat.nameAr, debit: stmtVat, credit: 0, notes: 'ضريبة رسوم' });
        // Adjust debit on noon AR
        lines[0].debit = netProceeds + totalFees;
      }

      const totalD = lines.reduce((s, l) => s + l.debit, 0);
      const totalC = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalD - totalC) > 0.01) return null;

      return this.prisma.journalEntry.create({
        data: {
          organizationId: orgId,
          journalNumber:  await this.nextJournalNumber(orgId),
          entryDate,
          description:    `استيراد نون: ${batch.statementNr ?? batchId}`,
          reference:      batch.statementNr ?? batchId,
          status:         'posted',
          sourceType:     'import_batch',
          sourceId:       batchId,
          createdById:    createdById ?? null,
          lines:          { create: lines },
        },
        include: { lines: true },
      });
    } catch (err) {
      this.logger.warn(`Auto-generate from import ${batchId} failed: ${err}`);
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  async nextJournalNumber(orgId: number): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.journalEntry.count({
      where: { organizationId: orgId, journalNumber: { startsWith: `JE-${year}-` } },
    });
    return `JE-${year}-${String(count + 1).padStart(5, '0')}`;
  }
}
