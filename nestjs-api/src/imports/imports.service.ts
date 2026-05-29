import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { ImportType, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccountingService } from '../accounting/accounting.service';
import { parseCsvBuffer } from './csv/parser';
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
    this.logger.log(
      `Parsed CSV: format=${parsed.format} customerRows=${parsed.customerRows.length} oldRows=${parsed.oldRows.length} weeklyRows=${parsed.weeklyRows.length} inventoryRows=${parsed.inventoryRows.length} feeRows=${parsed.feeRows.length}`,
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
        const [fbnWh, retWh] = await Promise.all([
          this.prisma.warehouse.findFirst({ where: { organizationId: orgId, code: 'FBN' } }),
          this.prisma.warehouse.findFirst({ where: { organizationId: orgId, code: 'RETURNS' } }),
        ]);

        await this.prisma.$transaction(async tx => {
          for (const row of parsed.customerRows) {
            try {
              const itemStatus = row.docType === 'Invoice' ? 'delivered' : 'returned';

              const existing = await tx.order.findFirst({
                where: { organizationId: orgId, orderNr: row.orderNr, itemNr: row.itemNr, itemStatus },
                select: { id: true },
              });

              if (existing) { rowsSkipped++; continue; }

              const orderedDate    = row.docDate ? new Date(row.docDate) : undefined;
              const deliveredDate  = itemStatus === 'delivered' ? row.docDate : null;
              const returnedDate   = itemStatus === 'returned'  ? row.docDate : null;

              await tx.order.create({
                data: {
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
                },
              });

              rowsImported++;

              if (itemStatus === 'delivered') {
                salesCount++;
                totalSales += row.netProceeds;
                if (row.sku && fbnWh) {
                  if (warnings.length < 50) {
                    const stock = await tx.inventoryMovement.aggregate({
                      where: { organizationId: orgId, sku: row.sku, warehouseId: fbnWh.id, isVoid: false },
                      _sum:  { quantity: true },
                    });
                    const qty = stock._sum.quantity ?? 0;
                    if (qty - 1 < 0) warnings.push(`FBN stock negative after sale: SKU ${row.sku} (would be ${qty - 1})`);
                  }
                  await tx.inventoryMovement.create({
                    data: { organizationId: orgId, sku: row.sku, warehouseId: fbnWh.id, movementType: MovementType.sale, quantity: -1, batchId, reference: row.orderNr },
                  }).catch(() => {});
                }
              } else {
                returnsCount++;
                if (row.sku && retWh) {
                  await tx.inventoryMovement.create({
                    data: { organizationId: orgId, sku: row.sku, warehouseId: retWh.id, movementType: MovementType.noon_return, quantity: 1, batchId, reference: row.orderNr },
                  }).catch(() => {});
                }
              }

              if (row.sku) {
                const ep = await tx.product.findUnique({ where: { organizationId_sku: { organizationId: orgId, sku: row.sku } } });
                if (!ep) {
                  await tx.product.create({ data: { organizationId: orgId, sku: row.sku, partnerSku: row.partnerSku || null, nameEn: row.productTitleEn || null } }).catch(() => {});
                } else if (!ep.partnerSku && row.partnerSku) {
                  await tx.product.update({ where: { organizationId_sku: { organizationId: orgId, sku: row.sku } }, data: { partnerSku: row.partnerSku } });
                }
              }
            } catch (err) {
              this.logger.warn(`Skipped customer row ${row.orderNr}/${row.itemNr}: ${(err as Error).message}`);
              rowsSkipped++;
            }
          }

          for (const fee of parsed.feeRows) {
            try {
              await tx.statementFee.create({
                data: {
                  organizationId: orgId,
                  statementNr:    fee.statementNr || null,
                  statementDate:  fee.statementDate || null,
                  feeType:        fee.feeType,
                  description:    fee.description || null,
                  exclVat:        fee.exclVat.toFixed(4),
                  vatAmount:      fee.vatAmount.toFixed(4),
                  inclVat:        fee.inclVat.toFixed(4),
                  importBatch:    batchId,
                },
              });
              totalFees += Math.abs(fee.exclVat);
              feesVat   += Math.abs(fee.vatAmount);
            } catch {
              /* non-fatal */
            }
          }

          await tx.importBatch.create({
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
        }, TX_OPTS);

      } else if (parsed.format === 'weekly_noon') {
        // ── WEEKLY NOON SALES FORMAT ────────────────────────────────────────────
        // Same upsert logic as old format; weekly has richer fee breakdown columns
        // that are not yet stored in separate DB fields — mapped to existing Order fields.
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

          await tx.importBatch.create({
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
              feesCount:     0,
              statementNr:   parsed.statementNr  || null,
              statementDate: parsed.statementDate || null,
              status:        'completed',
            },
          });
        }, TX_OPTS);

      } else if (parsed.format === 'full_inventory') {
        // ── FULL INVENTORY SNAPSHOT FORMAT ─────────────────────────────────────
        // For each row: find/create warehouse + product, then sync stock via adjustment.
        await this.prisma.$transaction(async tx => {
          // Cache warehouses looked up in this batch to avoid repeated queries
          const whCache = new Map<string, number>();

          for (const row of parsed.inventoryRows) {
            try {
              const effectiveSku = row.sku || row.partnerSku;
              if (!effectiveSku || !row.warehouseCode) { rowsSkipped++; continue; }

              // ── Warehouse lookup / create ──────────────────────────────────
              let warehouseId = whCache.get(row.warehouseCode);
              if (warehouseId === undefined) {
                let wh = await tx.warehouse.findFirst({
                  where: { organizationId: orgId, code: row.warehouseCode },
                });
                if (!wh) {
                  wh = await tx.warehouse.create({
                    data: { organizationId: orgId, name: row.warehouseCode, code: row.warehouseCode },
                  });
                }
                warehouseId = wh.id;
                whCache.set(row.warehouseCode, wh.id);
              }

              // ── Product lookup / create / update ───────────────────────────
              let product = row.partnerSku
                ? await tx.product.findFirst({ where: { organizationId: orgId, partnerSku: row.partnerSku } })
                : null;
              if (!product && row.sku) {
                product = await tx.product.findUnique({ where: { organizationId_sku: { organizationId: orgId, sku: row.sku } } });
              }

              if (!product) {
                const newSku = row.sku || row.partnerSku;
                product = await tx.product.create({
                  data: {
                    organizationId: orgId,
                    sku:        newSku,
                    partnerSku: row.partnerSku || null,
                    barcode:    row.barcode    || null,
                    brand:      row.brand      || null,
                    family:     row.family     || null,
                    nameEn:     row.title      || null,
                  },
                }).catch(async () => {
                  return tx.product.findUnique({ where: { organizationId_sku: { organizationId: orgId, sku: newSku } } });
                }) as typeof product;
                rowsImported++;
              } else {
                // Enrich product fields if currently blank
                const upd: Record<string, unknown> = {};
                if (!product.barcode && row.barcode) upd.barcode    = row.barcode;
                if (!product.brand   && row.brand)   upd.brand      = row.brand;
                if (!product.nameEn  && row.title)   upd.nameEn     = row.title;
                if (!product.family  && row.family)  upd.family     = row.family;
                if (!product.partnerSku && row.partnerSku) upd.partnerSku = row.partnerSku;
                if (Object.keys(upd).length > 0) {
                  await tx.product.update({ where: { id: product.id }, data: upd });
                  productsUpdated++;
                }
              }

              // ── Stock sync via adjustment movement ─────────────────────────
              // Only sync for saleable inventory (skip damaged/quarantine)
              const invType = row.inventoryType.toLowerCase();
              if (!invType.includes('saleable') && invType !== '') {
                rowsSkipped++;
                continue;
              }

              const stockAgg = await tx.inventoryMovement.aggregate({
                where: { organizationId: orgId, sku: effectiveSku, warehouseId, isVoid: false },
                _sum:  { quantity: true },
              });
              const currentQty = Number(stockAgg._sum.quantity ?? 0);
              const delta      = row.qty - currentQty;

              if (delta !== 0) {
                const snapshotRef = `INV-SYNC-${row.snapshotAt?.slice(0, 10) || 'snapshot'}`;
                await tx.inventoryMovement.create({
                  data: {
                    organizationId: orgId,
                    sku:          effectiveSku,
                    productId:    product?.id ?? null,
                    warehouseId,
                    movementType: MovementType.noon_sync,
                    quantity:     delta,
                    batchId,
                    reference:    snapshotRef,
                    notes:        `مزامنة مخزون: ${row.inventoryType}`,
                    reasonCode:   row.reasonCode || null,
                  },
                });
                stockUpdated++;
              } else {
                rowsSkipped++;
              }
            } catch (err) {
              this.logger.warn(`Skipped inventory row sku=${row.sku} wh=${row.warehouseCode}: ${(err as Error).message}`);
              rowsSkipped++;
            }
          }

          await tx.importBatch.create({
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
        }, { timeout: 60_000, maxWait: 10_000 });

      } else {
        // ── OLD / SALES FORMAT ──────────────────────────────────────────────────
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

          await tx.importBatch.create({
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
        }, TX_OPTS);
      }
    } catch (err) {
      // Log single-line JSON so Vercel runtime logs capture the full error without truncation
      console.error(JSON.stringify({
        event:   'import_error',
        orgId,
        format:  parsed.format,
        rows:    parsed.customerRows.length + parsed.oldRows.length + parsed.weeklyRows.length + parsed.inventoryRows.length,
        message: (err as Error).message,
        stack:   (err as Error).stack,
      }));
      throw err;
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
}

// Parse a date string without throwing — returns undefined for invalid dates
function safeDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}
