import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { ImportType, MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountingService } from '../accounting/accounting.service';
import { parseCsvBuffer, classifyFeeDescription } from './csv/parser';
import { ImportResult } from './csv/types';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Prisma interactive transactions default to 5 s — way too short for large CSVs.
const TX_OPTS = { timeout: 25_000, maxWait: 5_000 };

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
    @Optional() private accounting: AccountingService,
  ) {}

  // ─── Upload & process ─────────────────────────────────────────────────────────

  async processUpload(
    file: Express.Multer.File,
    orgId: number,
    actorId: number,
    importTypeHint?: string,
  ): Promise<ImportResult> {
    // Guard: multer may not populate file in some Vercel environments
    if (!file) {
      throw new BadRequestException(
        'لم يتم استلام ملف — يرجى التأكد من رفع الملف بصيغة multipart/form-data واختيار حقل "file"',
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('File exceeds the 10 MB limit');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only .csv files are accepted');
    }

    const fileHash = createHash('md5').update(file.buffer).digest('hex');

    const duplicate = await this.prisma.importBatch.findFirst({
      where: { organizationId: orgId, fileHash },
    });
    if (duplicate) {
      throw new BadRequestException(
        `This file was already imported (batch ${duplicate.batchId})`,
      );
    }

    const parsed = parseCsvBuffer(file.buffer, importTypeHint);

    // Log to Vercel function logs — visible in dashboard for debugging
    console.log(JSON.stringify({
      event:          'import_parsed',
      importType:     importTypeHint ?? 'auto',
      detectedFormat: parsed.format,
      filename:       file.originalname,
      customerRows:   parsed.customerRows.length,
      oldRows:        parsed.oldRows.length,
      weeklyRows:     parsed.weeklyRows.length,
      inventoryRows:  parsed.inventoryRows.length,
      feeRows:        parsed.feeRows.length,
    }));

    this.logger.log(
      `Import: type=${importTypeHint ?? 'auto'} format=${parsed.format} file=${file.originalname} ` +
      `rows=${parsed.customerRows.length + parsed.oldRows.length + parsed.weeklyRows.length + parsed.inventoryRows.length}`,
    );

    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const warnings: string[] = [];
    let rowsImported    = 0;
    let rowsSkipped     = 0;
    let rowsUpdated     = 0;
    let salesCount      = 0;
    let returnsCount    = 0;
    let totalSales      = 0;
    let totalFees       = 0;
    let feesVat         = 0;
    let productsUpdated = 0;
    let stockUpdated    = 0;

    try {
      if (parsed.format === 'monthly') {
        // ── MONTHLY FORMAT ─────────────────────────────────────────────────────
        // Optimized: all reads outside transaction, bulk createMany inside.
        // Reduces DB round trips from O(N) per row to O(1) total.

        const [fbnWh, retWh] = await Promise.all([
          this.prisma.warehouse.findFirst({ where: { organizationId: orgId, code: 'FBN' } }),
          this.prisma.warehouse.findFirst({ where: { organizationId: orgId, code: 'RETURNS' } }),
        ]);

        // Pre-load existing orders for duplicate detection (one bulk query)
        const uniqueOrderNrsM = [...new Set(parsed.customerRows.map(r => r.orderNr).filter(Boolean))];
        const existingOrdersM = uniqueOrderNrsM.length
          ? await this.prisma.order.findMany({
              where:  { organizationId: orgId, orderNr: { in: uniqueOrderNrsM } },
              select: { orderNr: true, itemNr: true, itemStatus: true },
            })
          : [];
        const existingOrderSetM = new Set(
          existingOrdersM.map(o => `${o.orderNr}|${o.itemNr ?? ''}|${o.itemStatus ?? ''}`),
        );

        // Pre-load existing products for these SKUs (one bulk query)
        const uniqueSkusM = [...new Set(parsed.customerRows.map(r => r.sku).filter(Boolean))] as string[];
        const existingProdsM = uniqueSkusM.length
          ? await this.prisma.product.findMany({
              where:  { organizationId: orgId, sku: { in: uniqueSkusM } },
              select: { sku: true, partnerSku: true },
            })
          : [];
        const prodSkuMapM = new Map(existingProdsM.map(p => [p.sku, p] as [string, { sku: string; partnerSku: string | null }]));

        // Pre-load FBN stock for negative-stock warnings (one groupBy)
        const fbnStockMap = new Map<string, number>();
        if (fbnWh && uniqueSkusM.length > 0) {
          const sg = await this.prisma.inventoryMovement.groupBy({
            by:    ['sku'],
            where: { organizationId: orgId, warehouseId: fbnWh.id, isVoid: false, sku: { in: uniqueSkusM } },
            _sum:  { quantity: true },
          });
          for (const s of sg) fbnStockMap.set(s.sku, Number(s._sum.quantity ?? 0));
        }

        // Process all rows in memory — zero DB calls in this loop
        const ordersToInsertM:    Prisma.OrderCreateManyInput[]             = [];
        const movementsToInsertM: Prisma.InventoryMovementCreateManyInput[] = [];
        const productsToInsertM:  Prisma.ProductCreateManyInput[]           = [];
        const feesToInsertM:      Prisma.StatementFeeCreateManyInput[]      = [];
        const productPartnerUpdatesM = new Map<string, string>(); // sku → partnerSku to back-fill
        const newProdSkusM = new Set<string>();

        for (const row of parsed.customerRows) {
          try {
            const itemStatus = row.docType === 'Invoice' ? 'delivered' : 'returned';
            const key = `${row.orderNr}|${row.itemNr ?? ''}|${itemStatus}`;
            if (existingOrderSetM.has(key)) { rowsSkipped++; continue; }

            const orderedDate   = row.docDate ? safeDate(row.docDate) : undefined;
            const deliveredDate = itemStatus === 'delivered' ? row.docDate : null;
            const returnedDate  = itemStatus === 'returned'  ? row.docDate : null;

            ordersToInsertM.push({
              organizationId: orgId,
              orderNr:        row.orderNr,
              itemNr:         row.itemNr,
              sku:            row.sku || null,
              partnerSku:     row.partnerSku || null,
              productTitleEn: row.productTitleEn || null,
              itemStatus,
              orderedDate,
              deliveredDate,
              returnedDate,
              netProceeds:    row.netProceeds.toFixed(2),
              referralFee:    '0.00',
              fbnOutboundFee: '0.00',
              totalPayment:   row.netProceeds.toFixed(2),
              importBatch:    batchId,
            });
            rowsImported++;

            if (itemStatus === 'delivered') {
              salesCount++;
              totalSales += row.netProceeds;
              if (row.sku && fbnWh) {
                const qty    = fbnStockMap.get(row.sku) ?? 0;
                const newQty = qty - 1;
                if (newQty < 0 && warnings.length < 50) {
                  warnings.push(`FBN stock negative after sale: SKU ${row.sku} (would be ${newQty})`);
                }
                fbnStockMap.set(row.sku, newQty);
                movementsToInsertM.push({
                  organizationId: orgId, sku: row.sku, warehouseId: fbnWh.id,
                  movementType: MovementType.sale, quantity: -1, batchId, reference: row.orderNr,
                });
              }
            } else {
              returnsCount++;
              if (row.sku && retWh) {
                movementsToInsertM.push({
                  organizationId: orgId, sku: row.sku, warehouseId: retWh.id,
                  movementType: MovementType.noon_return, quantity: 1, batchId, reference: row.orderNr,
                });
              }
            }

            if (row.sku) {
              const ep = prodSkuMapM.get(row.sku);
              if (!ep && !newProdSkusM.has(row.sku)) {
                productsToInsertM.push({
                  organizationId: orgId,
                  sku:            row.sku,
                  partnerSku:     row.partnerSku || null,
                  nameEn:         row.productTitleEn || null,
                });
                newProdSkusM.add(row.sku);
                prodSkuMapM.set(row.sku, { sku: row.sku, partnerSku: row.partnerSku || null });
              } else if (ep && !ep.partnerSku && row.partnerSku && !productPartnerUpdatesM.has(row.sku)) {
                productPartnerUpdatesM.set(row.sku, row.partnerSku);
                ep.partnerSku = row.partnerSku; // prevent duplicate entries
              }
            }
          } catch (err) {
            this.logger.warn(`Skipped monthly customer row ${row.orderNr}/${row.itemNr}: ${(err as Error).message}`);
            rowsSkipped++;
          }
        }

        for (const fee of parsed.feeRows) {
          feesToInsertM.push({
            organizationId: orgId,
            statementNr:    fee.statementNr || null,
            statementDate:  fee.statementDate || null,
            feeType:        fee.feeType,
            description:    fee.description || null,
            exclVat:        fee.exclVat.toFixed(4),
            vatAmount:      fee.vatAmount.toFixed(4),
            inclVat:        fee.inclVat.toFixed(4),
            importBatch:    batchId,
          });
          totalFees += Math.abs(fee.exclVat);
          feesVat   += Math.abs(fee.vatAmount);
        }

        // Write-only transaction — no reads inside, completes in milliseconds
        try {
          await this.prisma.$transaction(async tx => {
            const CHUNK = 500;
            for (let i = 0; i < ordersToInsertM.length; i += CHUNK) {
              await tx.order.createMany({ data: ordersToInsertM.slice(i, i + CHUNK), skipDuplicates: true });
            }
            if (movementsToInsertM.length > 0) {
              for (let i = 0; i < movementsToInsertM.length; i += CHUNK) {
                await tx.inventoryMovement.createMany({ data: movementsToInsertM.slice(i, i + CHUNK) });
              }
            }
            if (productsToInsertM.length > 0) {
              await tx.product.createMany({ data: productsToInsertM, skipDuplicates: true });
            }
            if (feesToInsertM.length > 0) {
              for (let i = 0; i < feesToInsertM.length; i += CHUNK) {
                await tx.statementFee.createMany({ data: feesToInsertM.slice(i, i + CHUNK) });
              }
            }
          }, { timeout: 60_000, maxWait: 10_000 });
        } catch (txErr) {
          const txMsg = (txErr as Error).message ?? 'Transaction failed';
          if (txMsg.includes('Transaction already closed') || txMsg.includes('P2028') || txMsg.includes('expired')) {
            throw new BadRequestException('فشلت معالجة الملف لأن حجم البيانات كبير. حاول تقسيم الملف أو أعد المحاولة.');
          }
          throw new BadRequestException(`فشلت معالجة الملف الشهري — ${txMsg.slice(0, 200)}`);
        }

        await this.prisma.importBatch.create({
          data: {
            organizationId: orgId,
            batchId,
            importType:    ImportType.monthly_statement,
            fileName:      file.originalname,
            fileHash,
            rowsImported,
            rowsSkipped,
            salesCount,
            returnsCount,
            feesCount:     parsed.feeRows.length,
            statementNr:   parsed.statementNr || null,
            statementDate: parsed.statementDate || null,
            status:        'completed',
          },
        });

        // Back-fill partnerSku on existing products that lacked it
        for (const [sku, partnerSku] of productPartnerUpdatesM) {
          await this.prisma.product.updateMany({
            where: { organizationId: orgId, sku, partnerSku: null },
            data:  { partnerSku },
          }).catch(() => {});
        }

      } else if (parsed.format === 'weekly_noon') {
        // ── WEEKLY NOON SALES FORMAT ────────────────────────────────────────────
        try {
          await this.prisma.$transaction(async tx => {
          for (const row of parsed.weeklyRows) {
            try {
              const rNet = r4(row.netProceeds);
              const rRef = r4(row.referralFee);
              const rFbn = r4(row.fbnOutboundFee);
              const rPay = r4(row.totalPayment);

              const existing = await tx.order.findFirst({
                where:  { organizationId: orgId, orderNr: row.orderNr, itemNr: row.itemNr },
                select: { id: true, netProceeds: true, referralFee: true, fbnOutboundFee: true, totalPayment: true },
              });

              const parsedDate = row.orderedDate ? safeDate(row.orderedDate) : undefined;

              const createData = {
                organizationId: orgId,
                orderNr:        row.orderNr,
                itemNr:         row.itemNr,
                sku:            row.sku       || null,
                partnerSku:     row.partnerSku || null,
                brandEn:        row.brandEn   || null,
                brandAr:        row.brandAr   || null,
                productTitleEn: row.productTitleEn || null,
                productTitleAr: row.productTitleAr || null,
                itemStatus:     row.itemStatus || null,
                orderedDate:    parsedDate,
                deliveredDate:  row.deliveredDate || null,
                returnedDate:   row.returnedDate  || null,
                netProceeds:    row.netProceeds.toFixed(2),
                referralFee:    row.referralFee.toFixed(2),
                fbnOutboundFee: row.fbnOutboundFee.toFixed(2),
                totalPayment:   row.totalPayment.toFixed(2),
                importBatch:    batchId,
              };

              if (!existing) {
                await tx.order.create({ data: createData });
                rowsImported++;
                const st = (row.itemStatus ?? '').toLowerCase();
                if (st.includes('deliver'))     { salesCount++; totalSales += row.netProceeds; }
                else if (st.includes('return')) returnsCount++;
              } else {
                const exNet = r4(parseFloat((existing.netProceeds  ?? 0).toString()));
                const exRef = r4(parseFloat((existing.referralFee  ?? 0).toString()));
                const exFbn = r4(parseFloat((existing.fbnOutboundFee ?? 0).toString()));
                const exPay = r4(parseFloat((existing.totalPayment ?? 0).toString()));

                if (rNet === exNet && rRef === exRef && rFbn === exFbn && rPay === exPay) {
                  rowsSkipped++;
                } else {
                  await tx.order.update({
                    where: { id: existing.id },
                    data:  {
                      netProceeds:    row.netProceeds.toFixed(2),
                      referralFee:    row.referralFee.toFixed(2),
                      fbnOutboundFee: row.fbnOutboundFee.toFixed(2),
                      totalPayment:   row.totalPayment.toFixed(2),
                    },
                  });
                  rowsUpdated++;
                }
              }

              // Product upsert
              if (row.sku) {
                const ep = await tx.product.findUnique({ where: { organizationId_sku: { organizationId: orgId, sku: row.sku } } });
                if (!ep) {
                  await tx.product.create({
                    data: {
                      organizationId: orgId,
                      sku:       row.sku,
                      partnerSku: row.partnerSku || null,
                      brand:     row.brandEn || null,
                      nameEn:    row.productTitleEn || null,
                      nameAr:    row.productTitleAr || null,
                    },
                  }).catch(() => {});
                } else {
                  const updates: Record<string, unknown> = {};
                  if (!ep.partnerSku && row.partnerSku) updates.partnerSku = row.partnerSku;
                  if (!ep.brand      && row.brandEn)    updates.brand      = row.brandEn;
                  if (!ep.nameEn     && row.productTitleEn) updates.nameEn = row.productTitleEn;
                  if (Object.keys(updates).length > 0) {
                    await tx.product.update({ where: { organizationId_sku: { organizationId: orgId, sku: row.sku } }, data: updates });
                    productsUpdated++;
                  }
                }
              }
            } catch (err) {
              this.logger.warn(`Skipped weekly row ${row.orderNr}/${row.itemNr}: ${(err as Error).message}`);
              rowsSkipped++;
            }
          }

          // importBatch.create moved outside — see monthly comment above.
        }, TX_OPTS);
        } catch (txErr) {
          const txMsg = (txErr as Error).message ?? 'Transaction failed';
          throw new BadRequestException(
            `فشلت معالجة الملف الأسبوعي — ${txMsg.slice(0, 200)}`,
          );
        }

        // Persist statement-level fee rows (e.g. "Return Administration Fee" with no order_nr)
        if (parsed.feeRows.length > 0) {
          await this.prisma.statementFee.createMany({
            data: parsed.feeRows.map(fee => ({
              organizationId: orgId,
              statementNr:    fee.statementNr   || null,
              statementDate:  fee.statementDate || null,
              feeType:        fee.feeType,
              description:    fee.description   || null,
              exclVat:        fee.exclVat.toFixed(4),
              vatAmount:      fee.vatAmount.toFixed(4),
              inclVat:        fee.inclVat.toFixed(4),
              importBatch:    batchId,
            })),
          });
          for (const fee of parsed.feeRows) {
            totalFees += fee.inclVat;
            feesVat   += fee.vatAmount;
          }
        }

        await this.prisma.importBatch.create({
          data: {
            organizationId: orgId,
            batchId,
            importType:    ImportType.weekly_noon,
            fileName:      file.originalname,
            fileHash,
            rowsImported,
            rowsSkipped,
            salesCount,
            returnsCount,
            feesCount:     parsed.feeRows.length,
            statementNr:   parsed.statementNr  || null,
            statementDate: parsed.statementDate || null,
            status:        'completed',
          },
        });

      } else if (parsed.format === 'full_inventory') {
        // ── FULL INVENTORY SNAPSHOT FORMAT ─────────────────────────────────────
        // Batch-optimised: 3 reads up-front, all rows processed in memory,
        // one createMany at the end. No wrapping transaction → no 30s Vercel timeout.

        console.log(JSON.stringify({
          event: 'inventory_import_start',
          importType: importTypeHint,
          filename:   file.originalname,
          rows:       parsed.inventoryRows.length,
        }));

        // ── Step 1: Pre-load warehouses ─────────────────────────────────────────
        const uniqueWhCodes = [...new Set(parsed.inventoryRows.map(r => r.warehouseCode).filter(Boolean))];
        const existingWh    = await this.prisma.warehouse.findMany({
          where: { organizationId: orgId, code: { in: uniqueWhCodes } },
          select: { id: true, code: true },
        });
        const whCodeMap = new Map(existingWh.map(w => [w.code!, w.id]));

        // Create any missing warehouses
        for (const code of uniqueWhCodes) {
          if (code && !whCodeMap.has(code)) {
            const wh = await this.prisma.warehouse.create({
              data: { organizationId: orgId, name: code, code },
            }).catch(() => null);
            if (wh) whCodeMap.set(code, wh.id);
          }
        }

        // ── Step 2: Pre-load products ───────────────────────────────────────────
        const uniqueSkus        = [...new Set(parsed.inventoryRows.map(r => r.sku).filter(Boolean))];
        const uniquePartnerSkus = [...new Set(parsed.inventoryRows.map(r => r.partnerSku).filter(Boolean))];

        const prodSelect = { id: true, sku: true, partnerSku: true, barcode: true, brand: true, nameEn: true, family: true } as const;

        const orClauses: object[] = [];
        if (uniqueSkus.length)        orClauses.push({ sku:        { in: uniqueSkus        } });
        if (uniquePartnerSkus.length) orClauses.push({ partnerSku: { in: uniquePartnerSkus } });

        const existingProducts = orClauses.length
          ? await this.prisma.product.findMany({ where: { organizationId: orgId, OR: orClauses }, select: prodSelect })
          : [];

        const prodBySkuMap     = new Map(existingProducts.map(p => [p.sku, p]));
        const prodByPartSkuMap = new Map(existingProducts.filter(p => p.partnerSku).map(p => [p.partnerSku!, p]));

        // ── Step 3: Pre-load current stock levels via one groupBy ───────────────
        const stockGroupBy = await this.prisma.inventoryMovement.groupBy({
          by: ['sku', 'warehouseId'],
          where: { organizationId: orgId, isVoid: false },
          _sum: { quantity: true },
        });
        const skStr = (sku: string, whId: number) => `${sku}|${whId}`;
        const stockMap = new Map(
          stockGroupBy.map(s => [skStr(s.sku, s.warehouseId ?? 0), Number(s._sum.quantity ?? 0)])
        );

        // ── Step 4: Process rows in memory ──────────────────────────────────────
        const movements: {
          organizationId: number; sku: string; productId: number | null;
          warehouseId: number; movementType: MovementType; quantity: number;
          batchId: string; reference: string; notes: string; reasonCode: string | null;
        }[] = [];

        for (const row of parsed.inventoryRows) {
          try {
            const effectiveSku = row.sku || row.partnerSku;
            if (!effectiveSku || !row.warehouseCode) { rowsSkipped++; continue; }

            const warehouseId = whCodeMap.get(row.warehouseCode);
            if (!warehouseId) { rowsSkipped++; continue; }

            // Find product in cache
            let product = (row.partnerSku ? prodByPartSkuMap.get(row.partnerSku) : undefined)
                       ?? prodBySkuMap.get(row.sku);

            if (!product) {
              const newSku = row.sku || row.partnerSku;
              const created = await this.prisma.product.create({
                data: {
                  organizationId: orgId,
                  sku:        newSku,
                  partnerSku: row.partnerSku || null,
                  barcode:    row.barcode    || null,
                  brand:      row.brand      || null,
                  family:     row.family     || null,
                  nameEn:     row.title      || null,
                },
                select: prodSelect,
              }).catch(async () =>
                this.prisma.product.findUnique({
                  where: { organizationId_sku: { organizationId: orgId, sku: newSku } },
                  select: prodSelect,
                })
              );
              if (!created) { rowsSkipped++; continue; }
              product = created;
              prodBySkuMap.set(product.sku, product);
              if (product.partnerSku) prodByPartSkuMap.set(product.partnerSku, product);
              rowsImported++;
            } else {
              // Enrich blank fields (non-destructive)
              const upd: Record<string, unknown> = {};
              if (!product.barcode    && row.barcode)     upd.barcode    = row.barcode;
              if (!product.brand      && row.brand)       upd.brand      = row.brand;
              if (!product.nameEn     && row.title)       upd.nameEn     = row.title;
              if (!product.family     && row.family)      upd.family     = row.family;
              if (!product.partnerSku && row.partnerSku)  upd.partnerSku = row.partnerSku;
              if (Object.keys(upd).length > 0) {
                await this.prisma.product.update({ where: { id: product.id }, data: upd }).catch(() => {});
                productsUpdated++;
              }
            }

            // Only sync saleable inventory
            const invType = row.inventoryType.toLowerCase();
            if (invType && !invType.includes('saleable')) { rowsSkipped++; continue; }

            // Stock delta from in-memory map
            const currentQty = stockMap.get(skStr(effectiveSku, warehouseId)) ?? 0;
            const delta       = row.qty - currentQty;

            if (delta !== 0) {
              movements.push({
                organizationId: orgId,
                sku:          effectiveSku,
                productId:    product.id,
                warehouseId,
                movementType: MovementType.noon_sync,
                quantity:     delta,
                batchId,
                reference:    `INV-SYNC-${row.snapshotAt?.slice(0, 10) || 'snapshot'}`,
                notes:        `مزامنة مخزون: ${row.inventoryType || 'saleable'}`,
                reasonCode:   row.reasonCode || null,
              });
              stockMap.set(skStr(effectiveSku, warehouseId), row.qty); // keep cache consistent
              stockUpdated++;
            } else {
              rowsSkipped++;
            }
          } catch (err) {
            this.logger.warn(`Skipped inventory row sku=${row.sku} wh=${row.warehouseCode}: ${(err as Error).message}`);
            rowsSkipped++;
          }
        }

        // ── Step 5: Batch-insert movements + create batch record ────────────────
        if (movements.length > 0) {
          await this.prisma.inventoryMovement.createMany({ data: movements });
        }

        await this.prisma.importBatch.create({
          data: {
            organizationId: orgId,
            batchId,
            importType:    ImportType.full_inventory,
            fileName:      file.originalname,
            fileHash,
            rowsImported,
            rowsSkipped,
            salesCount:    0,
            returnsCount:  0,
            feesCount:     0,
            statementNr:   null,
            statementDate: parsed.statementDate || null,
            status:        'completed',
          },
        });

        console.log(JSON.stringify({
          event:           'inventory_import_done',
          rows:            parsed.inventoryRows.length,
          rowsImported,
          productsUpdated,
          stockUpdated,
          rowsSkipped,
          movements:       movements.length,
        }));

      } else {
        // ── OLD / SALES FORMAT ──────────────────────────────────────────────────
        try {
          await this.prisma.$transaction(async tx => {
          for (const row of parsed.oldRows) {
            try {
              const rNet = r4(row.netProceeds);
              const rRef = r4(row.referralFee);
              const rFbn = r4(row.fbnOutboundFee);
              const rPay = r4(row.totalPayment);

              const isShippingOnly = rNet === 0 && rRef === 0 && rFbn !== 0 && rPay === rFbn;

              const existing = await tx.order.findFirst({
                where:  { organizationId: orgId, orderNr: row.orderNr, itemNr: row.itemNr },
                select: { id: true, netProceeds: true, referralFee: true, fbnOutboundFee: true, totalPayment: true },
              });

              const parsedDate = row.orderedDate ? safeDate(row.orderedDate) : undefined;

              const createData = {
                organizationId: orgId,
                orderNr:        row.orderNr,
                itemNr:         row.itemNr,
                sku:            row.sku || null,
                partnerSku:     row.partnerSku || null,
                brandEn:        row.brandEn || null,
                brandAr:        row.brandAr || null,
                productTitleEn: row.productTitleEn || null,
                productTitleAr: row.productTitleAr || null,
                itemStatus:     row.itemStatus || null,
                orderedDate:    parsedDate,
                deliveredDate:  row.deliveredDate || null,
                returnedDate:   row.returnedDate || null,
                netProceeds:    row.netProceeds.toFixed(2),
                referralFee:    row.referralFee.toFixed(2),
                fbnOutboundFee: row.fbnOutboundFee.toFixed(2),
                totalPayment:   row.totalPayment.toFixed(2),
                importBatch:    batchId,
              };

              if (isShippingOnly) {
                if (!existing) {
                  await tx.order.create({ data: createData });
                  rowsImported++;
                } else {
                  const exFbn = r4(parseFloat((existing.fbnOutboundFee ?? 0).toString()));
                  if (exFbn === 0) {
                    const exPay = parseFloat((existing.totalPayment ?? 0).toString());
                    await tx.order.update({
                      where: { id: existing.id },
                      data:  { fbnOutboundFee: (exFbn + rFbn).toFixed(2), totalPayment: (exPay + rPay).toFixed(2) },
                    });
                    rowsUpdated++;
                  } else {
                    rowsSkipped++;
                  }
                }
              } else {
                if (!existing) {
                  await tx.order.create({ data: createData });
                  rowsImported++;
                  const st = (row.itemStatus ?? '').toLowerCase();
                  if (st.includes('deliver'))      salesCount++;
                  else if (st.includes('return'))  returnsCount++;
                } else {
                  const exNet = r4(parseFloat((existing.netProceeds ?? 0).toString()));
                  const exRef = r4(parseFloat((existing.referralFee ?? 0).toString()));
                  const exFbn = r4(parseFloat((existing.fbnOutboundFee ?? 0).toString()));
                  const exPay = r4(parseFloat((existing.totalPayment ?? 0).toString()));

                  if (rNet === exNet && rRef === exRef && rFbn === exFbn && rPay === exPay) {
                    rowsSkipped++;
                  } else {
                    await tx.order.update({
                      where: { id: existing.id },
                      data:  { netProceeds: row.netProceeds.toFixed(2), referralFee: row.referralFee.toFixed(2), fbnOutboundFee: row.fbnOutboundFee.toFixed(2), totalPayment: row.totalPayment.toFixed(2) },
                    });
                    rowsUpdated++;
                  }
                }
              }

              if (row.sku) {
                const ep = await tx.product.findUnique({ where: { organizationId_sku: { organizationId: orgId, sku: row.sku } } });
                if (!ep) {
                  await tx.product.create({ data: { organizationId: orgId, sku: row.sku, partnerSku: row.partnerSku || null, brand: row.brandEn || null, nameEn: row.productTitleEn || null } }).catch(() => {});
                } else if (!ep.partnerSku && row.partnerSku) {
                  await tx.product.update({ where: { organizationId_sku: { organizationId: orgId, sku: row.sku } }, data: { partnerSku: row.partnerSku } });
                }
              }
            } catch (err) {
              this.logger.warn(`Skipped old-format row ${row.orderNr}/${row.itemNr}: ${(err as Error).message}`);
              rowsSkipped++;
            }
          }

          // importBatch.create moved outside — see monthly comment above.
        }, TX_OPTS);
        } catch (txErr) {
          const txMsg = (txErr as Error).message ?? 'Transaction failed';
          throw new BadRequestException(
            `فشلت معالجة الملف — ${txMsg.slice(0, 200)}`,
          );
        }

        await this.prisma.importBatch.create({
          data: {
            organizationId: orgId,
            batchId,
            importType:    ImportType.orders,
            fileName:      file.originalname,
            fileHash,
            rowsImported,
            rowsSkipped,
            salesCount,
            returnsCount,
            feesCount:     0,
            statementNr:   parsed.statementNr || null,
            statementDate: parsed.statementDate || null,
            status:        'completed',
          },
        });
      }
    } catch (err) {
      // Log full error so Vercel runtime logs capture it for debugging
      console.error(JSON.stringify({
        event:   'import_error',
        orgId,
        format:  parsed.format,
        rows:    parsed.customerRows.length + parsed.oldRows.length + parsed.weeklyRows.length + parsed.inventoryRows.length,
        message: (err as Error).message,
        stack:   (err as Error).stack,
      }));

      // Re-throw HttpExceptions (BadRequestException etc.) as-is — they become 400.
      // Convert any other error to BadRequestException so the client gets a 400 with
      // context instead of a generic 500 "Internal server error".
      if (err instanceof BadRequestException) throw err;

      const rawMsg = (err as Error)?.message ?? 'Unknown error';

      // Specific Prisma / DB error messages mapped to Arabic
      if (rawMsg.includes('Transaction already closed') || rawMsg.includes('P2028')) {
        throw new BadRequestException('انتهت مهلة معالجة الملف — الملف كبير جداً. جرب تقسيمه.');
      }
      if (rawMsg.includes('Unique constraint') || rawMsg.includes('P2002')) {
        throw new BadRequestException('يوجد تعارض في البيانات — قد يكون بعض السجلات موجوداً مسبقاً.');
      }
      if (rawMsg.includes('Foreign key') || rawMsg.includes('P2003')) {
        throw new BadRequestException('خطأ في العلاقات — تعذر ربط السجلات بالمنظمة.');
      }
      if (rawMsg.includes('current transaction is aborted')) {
        throw new BadRequestException('فشلت معالجة الملف — حدث خطأ في قاعدة البيانات. راجع سجلات الملف.');
      }

      throw new BadRequestException(`خطأ في معالجة الملف: ${rawMsg.slice(0, 250)}`);
    }

    await this.audit.log({
      action:     'import_file',
      userId:     actorId,
      orgId,
      entityType: 'import_batch',
      entityId:   batchId,
      after: { batchId, fileName: file.originalname, format: parsed.format, rowsImported, rowsSkipped, rowsUpdated, productsUpdated, stockUpdated },
    });

    // Auto-generate accounting journal (non-fatal)
    if (this.accounting) {
      this.accounting.generateFromImportBatch(batchId, orgId, actorId).catch(e =>
        this.logger.warn(`Journal auto-generation skipped: ${e?.message}`),
      );
    }

    return {
      batchId,
      format:          parsed.format,
      rowsImported,
      rowsSkipped,
      rowsUpdated,
      salesCount,
      returnsCount,
      feesCount:       parsed.feeRows.length,
      totalSales:      Math.round(totalSales * 100) / 100,
      totalFees:       Math.round(totalFees  * 100) / 100,
      feesVat:         Math.round(feesVat    * 100) / 100,
      productsUpdated,
      stockUpdated,
      warnings,
    };
  }

  // ─── List batches ─────────────────────────────────────────────────────────────

  async listBatches(orgId: number, page = 1, limit = 50) {
    const skip  = (page - 1) * limit;
    const where = { organizationId: orgId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.importBatch.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id:           true,
          batchId:      true,
          importType:   true,
          fileName:     true,
          rowsImported: true,
          rowsSkipped:  true,
          salesCount:   true,
          returnsCount: true,
          feesCount:    true,
          statementNr:  true,
          statementDate: true,
          status:       true,
          createdAt:    true,
        },
      }),
      this.prisma.importBatch.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Delete batch ─────────────────────────────────────────────────────────────

  async deleteBatch(batchId: string, orgId: number, actorId: number) {
    const batch = await this.prisma.importBatch.findFirst({ where: { batchId, organizationId: orgId } });
    if (!batch) throw new NotFoundException('Import batch not found');

    const [ordersDeleted, movementsDeleted, feesDeleted] = await this.prisma.$transaction(async tx => {
      const [o, m, f] = await Promise.all([
        tx.order.deleteMany({ where: { organizationId: orgId, importBatch: batchId } }),
        tx.inventoryMovement.deleteMany({ where: { organizationId: orgId, batchId } }),
        tx.statementFee.deleteMany({ where: { organizationId: orgId, importBatch: batchId } }),
      ]);
      await tx.importBatch.delete({ where: { id: batch.id } });
      return [o.count, m.count, f.count];
    });

    await this.audit.log({
      action:     'delete_import_batch',
      userId:     actorId,
      orgId,
      entityType: 'import_batch',
      entityId:   batchId,
      before:     { batchId, ordersDeleted, movementsDeleted, feesDeleted },
    });

    return { deleted: true, batchId, ordersDeleted, movementsDeleted, feesDeleted };
  }

  // ─── Statement reconciliation ──────────────────────────────────────────────────
  // Produces a row-by-row breakdown of what Noon imported vs. what PreciseFlow
  // calculated, flagging any discrepancy so the user can pinpoint the mismatch.

  async getReconciliation(batchId: string, orgId: number) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { batchId, organizationId: orgId },
    });
    if (!batch) throw new NotFoundException('Import batch not found');

    // Parallel fetch — all data for this batch only
    const [orders, fees, allProducts] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId: orgId, importBatch: batchId },
        select: { itemStatus: true, netProceeds: true, referralFee: true, fbnOutboundFee: true, sku: true },
      }),
      this.prisma.statementFee.findMany({
        where: { organizationId: orgId, importBatch: batchId },
        select: { feeType: true, description: true, exclVat: true, vatAmount: true, inclVat: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        select: { sku: true, unitCost: true, extraCosts: true, costIncludesVat: true },
      }),
    ]);

    const costMap = new Map(allProducts.map(p => [p.sku, p]));

    // ── Aggregate orders ──────────────────────────────────────────────────────
    let grossSales          = 0;  // delivered netProceeds (incl VAT for monthly)
    let returnsTotal        = 0;  // abs of returned netProceeds
    let referralFeesSigned  = 0;  // signed sum: negative=charges, positive=credits
    let fbnFeesSigned       = 0;  // signed sum
    let cogs                = 0;

    for (const o of orders) {
      const status   = (o.itemStatus ?? '').toLowerCase();
      const proceeds = Number(o.netProceeds ?? 0);

      if (status === 'delivered') {
        grossSales += proceeds;
        if (o.sku) {
          const p = costMap.get(o.sku);
          if (p?.unitCost) {
            const cost = Number(p.unitCost);
            cogs += p.costIncludesVat ? cost / 1.15 : cost;
          }
          if (o.sku && costMap.get(o.sku)?.extraCosts) {
            cogs += Number(costMap.get(o.sku)!.extraCosts);
          }
        }
      } else if (status === 'returned') {
        returnsTotal += Math.abs(proceeds);
      }
      // Accumulate signed — credits (positive on returns) naturally reduce the sum
      referralFeesSigned += Number(o.referralFee    ?? 0);
      fbnFeesSigned      += Number(o.fbnOutboundFee ?? 0);
    }

    // abs of signed sum = net fees paid (charges minus any credits)
    const orderRefFees = Math.abs(referralFeesSigned);
    const orderFbnFees = Math.abs(fbnFeesSigned);

    const netSales = grossSales - returnsTotal;

    // ── Aggregate statement fees by category ──────────────────────────────────
    const feeByCat: Record<string, number> = {};
    const feeLines: {
      feeType: string; description: string; category: string;
      exclVat: number; vatAmount: number; inclVat: number;
    }[] = [];
    let totalStmtFees    = 0;
    let totalStmtFeeExcl = 0;
    let totalStmtFeeVat  = 0;

    for (const f of fees) {
      const cat  = classifyFeeDescription(f.description ?? '');
      const incl = Math.abs(Number(f.inclVat));
      const excl = Math.abs(Number(f.exclVat));
      const vat  = Math.abs(Number(f.vatAmount));
      feeByCat[cat]     = (feeByCat[cat] ?? 0) + incl;
      totalStmtFees    += incl;
      totalStmtFeeExcl += excl;
      totalStmtFeeVat  += vat;
      feeLines.push({
        feeType: f.feeType, description: f.description ?? '',
        category: cat, exclVat: excl, vatAmount: vat, inclVat: incl,
      });
    }

    // ── Decide which fee source to use ────────────────────────────────────────
    const isMonthly    = batch.importType === 'monthly_statement';
    const totalFees    = isMonthly ? totalStmtFees : (orderRefFees + orderFbnFees);
    const referralFee  = isMonthly ? (feeByCat['referralFee']    ?? 0) : orderRefFees;
    const fbnFee       = isMonthly ? (feeByCat['fbnOutboundFee'] ?? 0) : orderFbnFees;
    const returnFee    = feeByCat['returnFee']    ?? 0;
    const storageFee   = feeByCat['storageFee']   ?? 0;
    const damageFee    = feeByCat['damageFee']    ?? 0;
    const removalFee   = feeByCat['removalFee']   ?? 0;
    const compensation = feeByCat['compensation'] ?? 0;
    const otherFees    = feeByCat['other']        ?? 0;

    // Noon's net settlement = what they owe the seller after deducting fees
    const noonNetProceeds = netSales - totalFees;
    // Our final business profit = noonNetProceeds minus COGS
    const finalProfit     = noonNetProceeds - cogs;

    // ── Discrepancy checks ────────────────────────────────────────────────────
    const discrepancies: { field: string; noonValue: number; preciseflowValue: number; diff: number; note: string }[] = [];
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // For monthly: per-row referral/fbn fees should be 0 (they're in statementFees instead)
    if (isMonthly && r2(orderRefFees) !== 0) {
      discrepancies.push({
        field: 'referralFee (per-row)',
        noonValue: 0,
        preciseflowValue: r2(orderRefFees),
        diff: r2(orderRefFees),
        note: 'عمولة نون موجودة في الطلبات بالإضافة إلى رسوم الكشف — احتمال تكرار',
      });
    }

    // Revenue sanity: PreciseFlow gross sales should equal sum from Noon statement
    const noonSalesCountImplied   = batch.salesCount;
    const noonReturnsCountImplied = batch.returnsCount;
    const pfSalesCount   = orders.filter(o => (o.itemStatus ?? '').toLowerCase() === 'delivered').length;
    const pfReturnsCount = orders.filter(o => (o.itemStatus ?? '').toLowerCase() === 'returned').length;

    if (noonSalesCountImplied > 0 && noonSalesCountImplied !== pfSalesCount) {
      discrepancies.push({
        field: 'salesCount',
        noonValue: noonSalesCountImplied,
        preciseflowValue: pfSalesCount,
        diff: pfSalesCount - noonSalesCountImplied,
        note: 'عدد طلبات التسليم في قاعدة البيانات لا يطابق ما سُجِّل وقت الاستيراد',
      });
    }

    // ── Build reconciliation rows for UI table ────────────────────────────────
    const rows: { label: string; labelAr: string; noonValue: number | null; pfValue: number; diff: number | null; isSeparator?: boolean; isProfit?: boolean }[] = [
      { label: 'Gross Sales (delivered, incl VAT)',  labelAr: 'إجمالي المبيعات (مع ضريبة)',      noonValue: r2(grossSales),         pfValue: r2(grossSales),         diff: 0 },
      { label: 'Returns (creditnotes, incl VAT)',    labelAr: 'المرتجعات (مع ضريبة)',             noonValue: r2(returnsTotal),       pfValue: r2(returnsTotal),       diff: 0 },
      { label: 'Net Sales',                          labelAr: 'صافي المبيعات',                   noonValue: r2(netSales),           pfValue: r2(netSales),           diff: 0 },
      { label: '──',                                 labelAr: '──',                              noonValue: null, pfValue: 0, diff: null, isSeparator: true },
      { label: 'Referral Fee (incl VAT)',             labelAr: 'عمولة نون',                      noonValue: r2(referralFee),        pfValue: r2(referralFee),        diff: 0 },
      { label: 'FBN Outbound Fee (incl VAT)',         labelAr: 'رسوم FBN الصادرة',               noonValue: r2(fbnFee),             pfValue: r2(fbnFee),             diff: 0 },
      { label: 'Return Administration Fee (incl VAT)', labelAr: 'رسوم إدارة المرتجعات',          noonValue: r2(returnFee),          pfValue: r2(returnFee),          diff: 0 },
      { label: 'Storage Fees (incl VAT)',             labelAr: 'رسوم التخزين',                   noonValue: r2(storageFee),         pfValue: r2(storageFee),         diff: 0 },
      { label: 'Damaged Returns Fee (incl VAT)',      labelAr: 'رسوم المرتجعات التالفة',          noonValue: r2(damageFee),          pfValue: r2(damageFee),          diff: 0 },
      { label: 'RTV Removal Fee (incl VAT)',          labelAr: 'رسوم إزالة RTV',                 noonValue: r2(removalFee),         pfValue: r2(removalFee),         diff: 0 },
      { label: 'Compensation / Adjustments (incl VAT)', labelAr: 'تعويضات وتسويات',              noonValue: r2(compensation),       pfValue: r2(compensation),       diff: 0 },
      { label: 'Other Fees (incl VAT)',               labelAr: 'رسوم أخرى',                      noonValue: r2(otherFees),          pfValue: r2(otherFees),          diff: 0 },
      { label: 'Total Fees (incl VAT)',               labelAr: 'إجمالي رسوم نون',                noonValue: r2(totalFees),          pfValue: r2(totalFees),          diff: 0 },
      { label: '──',                                 labelAr: '──',                              noonValue: null, pfValue: 0, diff: null, isSeparator: true },
      { label: 'Noon Net Proceeds (after fees)',      labelAr: 'صافي تحويل نون (بعد الرسوم)',    noonValue: r2(noonNetProceeds),    pfValue: r2(noonNetProceeds),    diff: 0 },
      { label: 'Cost of Goods Sold (COGS)',           labelAr: 'تكلفة البضاعة المباعة',          noonValue: null,                   pfValue: r2(cogs),               diff: null },
      { label: 'Final Business Profit',               labelAr: 'الربح النهائي',                  noonValue: null,                   pfValue: r2(finalProfit),        diff: null, isProfit: true },
    ];

    return {
      batchId,
      statementNr:   batch.statementNr,
      statementDate: batch.statementDate,
      fileName:      batch.fileName,
      importType:    batch.importType,
      importedAt:    batch.createdAt.toISOString(),

      // Summary numbers
      grossSales:       r2(grossSales),
      returns:          r2(returnsTotal),
      netSales:         r2(netSales),
      referralFee:      r2(referralFee),
      fbnFee:           r2(fbnFee),
      returnFee:        r2(returnFee),
      storageFee:       r2(storageFee),
      damageFee:        r2(damageFee),
      removalFee:       r2(removalFee),
      compensation:     r2(compensation),
      otherFees:        r2(otherFees),
      totalFees:        r2(totalFees),
      totalFeesExclVat: r2(totalStmtFeeExcl),
      totalFeesVat:     r2(totalStmtFeeVat),
      noonNetProceeds:  r2(noonNetProceeds),
      cogs:             r2(cogs),
      finalProfit:      r2(finalProfit),

      // Counts
      deliveredCount: pfSalesCount,
      returnedCount:  pfReturnsCount,
      totalOrders:    orders.length,
      feeRowCount:    fees.length,

      // Breakdown
      feesByCategory:  feeByCat,
      feeLines,

      // Reconciliation table (ready for UI)
      reconciliationRows: rows,

      // Discrepancies found
      discrepancies,
      hasDiscrepancy: discrepancies.length > 0,
    };
  }
}

// Parse a date string without throwing — returns undefined for invalid dates
function safeDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}
