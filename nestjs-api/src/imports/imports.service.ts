import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ImportType, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { parseCsvBuffer } from './csv/parser';
import { ImportResult } from './csv/types';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditLogsService,
  ) {}

  // ─── Upload & process ─────────────────────────────────────────────────────────

  async processUpload(
    file: Express.Multer.File,
    orgId: number,
    actorId: number,
  ): Promise<ImportResult> {
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

    const parsed = parseCsvBuffer(file.buffer);

    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const warnings: string[] = [];
    let rowsImported = 0;
    let rowsSkipped = 0;
    let salesCount = 0;
    let returnsCount = 0;

    // Resolve warehouse IDs for FBN and RETURNS (soft — never blocks import)
    const [fbnWh, retWh] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { organizationId: orgId, code: 'FBN' } }),
      this.prisma.warehouse.findFirst({ where: { organizationId: orgId, code: 'RETURNS' } }),
    ]);

    await this.prisma.$transaction(async tx => {
      // ── Customer rows → orders + inventory movements ──────────────────────────
      for (const row of parsed.customerRows) {
        try {
          const itemStatus = row.docType === 'Invoice' ? 'delivered' : 'returned';

          const existing = await tx.order.findFirst({
            where: {
              organizationId: orgId,
              orderNr: row.orderNr,
              itemNr: row.itemNr,
              itemStatus,
            },
            select: { id: true },
          });

          if (existing) {
            rowsSkipped++;
            continue;
          }

          const orderedDate = row.docDate ? new Date(row.docDate) : undefined;

          await tx.order.create({
            data: {
              organizationId: orgId,
              orderNr: row.orderNr,
              itemNr: row.itemNr,
              sku: row.sku || null,
              partnerSku: row.partnerSku || null,
              productTitleEn: row.productTitleEn || null,
              itemStatus,
              orderedDate,
              netProceeds: row.netProceeds.toFixed(2),
              referralFee: '0.00',
              fbnOutboundFee: '0.00',
              totalPayment: row.netProceeds.toFixed(2),
              importBatch: batchId,
            },
          });

          rowsImported++;

          // ── Inventory movements ──────────────────────────────────────────────
          if (row.sku) {
            if (itemStatus === 'delivered' && fbnWh) {
              // Check if stock would go negative
              if (warnings.length < 50) {
                const stock = await tx.inventoryMovement.aggregate({
                  where: { organizationId: orgId, sku: row.sku, warehouseId: fbnWh.id, isVoid: false },
                  _sum: { quantity: true },
                });
                const currentQty = stock._sum.quantity ?? 0;
                if (currentQty - 1 < 0) {
                  warnings.push(`FBN stock negative after sale: SKU ${row.sku} (would be ${currentQty - 1})`);
                }
              }
              try {
                await tx.inventoryMovement.create({
                  data: {
                    organizationId: orgId,
                    sku: row.sku,
                    warehouseId: fbnWh.id,
                    movementType: MovementType.sale,
                    quantity: -1,
                    batchId,
                    reference: row.orderNr,
                  },
                });
              } catch {
                // never block import for movement errors
              }
              salesCount++;
            } else if (itemStatus === 'returned' && retWh) {
              try {
                await tx.inventoryMovement.create({
                  data: {
                    organizationId: orgId,
                    sku: row.sku,
                    warehouseId: retWh.id,
                    movementType: MovementType.noon_return,
                    quantity: 1,
                    batchId,
                    reference: row.orderNr,
                  },
                });
              } catch {
                // never block import for movement errors
              }
              returnsCount++;
            } else {
              // Warehouse not configured — count but skip movement
              if (itemStatus === 'delivered') salesCount++;
              else returnsCount++;
            }
          } else {
            if (itemStatus === 'delivered') salesCount++;
            else returnsCount++;
          }

          // ── Upsert product record ────────────────────────────────────────────
          if (row.sku) {
            const existingProduct = await tx.product.findUnique({
              where: { organizationId_sku: { organizationId: orgId, sku: row.sku } },
            });
            if (!existingProduct) {
              await tx.product.create({
                data: {
                  organizationId: orgId,
                  sku: row.sku,
                  partnerSku: row.partnerSku || null,
                  nameEn: row.productTitleEn || null,
                },
              }).catch(() => {
                // ignore race-condition duplicate
              });
            } else if (!existingProduct.partnerSku && row.partnerSku) {
              await tx.product.update({
                where: { organizationId_sku: { organizationId: orgId, sku: row.sku } },
                data: { partnerSku: row.partnerSku },
              });
            }
          }
        } catch (err) {
          this.logger.warn(`Skipped customer row: ${(err as Error).message}`);
          rowsSkipped++;
        }
      }

      // ── Fee rows → statement_fees ─────────────────────────────────────────────
      for (const fee of parsed.feeRows) {
        try {
          await tx.statementFee.create({
            data: {
              organizationId: orgId,
              statementNr: fee.statementNr || null,
              statementDate: fee.statementDate || null,
              feeType: fee.feeType,
              description: fee.description || null,
              exclVat: fee.exclVat.toFixed(4),
              vatAmount: fee.vatAmount.toFixed(4),
              inclVat: fee.inclVat.toFixed(4),
              importBatch: batchId,
            },
          });
        } catch {
          // fee row errors are non-fatal
        }
      }

      // ── Import batch record ───────────────────────────────────────────────────
      await tx.importBatch.create({
        data: {
          organizationId: orgId,
          batchId,
          importType: ImportType.monthly_statement,
          fileName: file.originalname,
          fileHash,
          rowsImported,
          rowsSkipped,
          salesCount,
          returnsCount,
          feesCount: parsed.feeRows.length,
          statementNr: parsed.statementNr || null,
          statementDate: parsed.statementDate || null,
          status: 'completed',
        },
      });
    });

    await this.audit.log({
      action: 'import_file',
      userId: actorId,
      orgId,
      entityType: 'import_batch',
      entityId: batchId,
      after: {
        batchId,
        fileName: file.originalname,
        rowsImported,
        rowsSkipped,
        salesCount,
        returnsCount,
        feesCount: parsed.feeRows.length,
      },
    });

    return {
      batchId,
      rowsImported,
      rowsSkipped,
      salesCount,
      returnsCount,
      feesCount: parsed.feeRows.length,
      warnings,
    };
  }

  // ─── List batches ─────────────────────────────────────────────────────────────

  async listBatches(orgId: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = { organizationId: orgId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.importBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          batchId: true,
          importType: true,
          fileName: true,
          rowsImported: true,
          rowsSkipped: true,
          salesCount: true,
          returnsCount: true,
          feesCount: true,
          statementNr: true,
          statementDate: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.importBatch.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Delete batch ─────────────────────────────────────────────────────────────

  async deleteBatch(batchId: string, orgId: number, actorId: number) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { batchId, organizationId: orgId },
    });
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
      action: 'delete_import_batch',
      userId: actorId,
      orgId,
      entityType: 'import_batch',
      entityId: batchId,
      before: {
        batchId,
        ordersDeleted,
        movementsDeleted,
        feesDeleted,
      },
    });

    return { deleted: true, batchId, ordersDeleted, movementsDeleted, feesDeleted };
  }
}
