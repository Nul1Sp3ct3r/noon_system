import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../common/decorators/current-user.decorator';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(role: Role, orgId = 1, sub = 42): JwtPayload {
  return { sub, username: 'testuser', orgId, role } as JwtPayload;
}

const PRODUCT = {
  id: 233, organizationId: 1, sku: 'Z-TEST-001',
  nameAr: 'منتج', nameEn: 'Product', brand: null, family: null,
  unitCost: '50.0000', extraCosts: null, costIncludesVat: false,
  notes: null, createdAt: new Date(), updatedAt: new Date(), partnerSku: null, barcode: null,
};

// ── Mock service ──────────────────────────────────────────────────────────────

const mockProductsService = {
  findAll:  jest.fn().mockResolvedValue({ items: [PRODUCT], total: 1, page: 1, limit: 50, pages: 1 }),
  findOne:  jest.fn().mockResolvedValue(PRODUCT),
  create:   jest.fn().mockResolvedValue(PRODUCT),
  update:   jest.fn().mockResolvedValue({ ...PRODUCT, notes: 'updated' }),
  remove:   jest.fn().mockResolvedValue({ deleted: true }),
};

// ── RolesGuard helper — runs the guard as the controller would ───────────────

function checkRole(guard: RolesGuard, handler: Function, role: Role): boolean {
  const ctx = {
    getHandler: () => handler,
    getClass:   () => ProductsController,
    switchToHttp: () => ({ getRequest: () => ({ user: makeUser(role) }) }),
  } as any;
  try {
    return guard.canActivate(ctx) as boolean;
  } catch {
    return false;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProductsController', () => {
  let controller: ProductsController;
  let rolesGuard: RolesGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: mockProductsService },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get(ProductsController);
    rolesGuard  = module.get(RolesGuard);
    jest.clearAllMocks();
  });

  // ── PATCH :id — role access ──────────────────────────────────────────────

  describe('PATCH /products/:id — role authorization', () => {
    const updateHandler = ProductsController.prototype.update;

    it.each([
      Role.admin,
      Role.super_admin,
      Role.merchant_owner,
      Role.merchant_accountant,
      Role.merchant_inventory,
      Role.merchant_data_entry,
    ])('allows role %s', (role) => {
      expect(checkRole(rolesGuard, updateHandler, role)).toBe(true);
    });

    it.each([
      Role.merchant_viewer,
      Role.platform_admin,
    ])('blocks role %s', (role) => {
      expect(checkRole(rolesGuard, updateHandler, role)).toBe(false);
    });
  });

  // ── POST — role access ────────────────────────────────────────────────────

  describe('POST /products — role authorization', () => {
    const createHandler = ProductsController.prototype.create;

    it.each([
      Role.admin, Role.super_admin,
      Role.merchant_owner, Role.merchant_accountant,
      Role.merchant_inventory, Role.merchant_data_entry,
    ])('allows role %s', (role) => {
      expect(checkRole(rolesGuard, createHandler, role)).toBe(true);
    });

    it('blocks merchant_viewer', () => {
      expect(checkRole(rolesGuard, createHandler, Role.merchant_viewer)).toBe(false);
    });
  });

  // ── DELETE — role access ──────────────────────────────────────────────────

  describe('DELETE /products/:id — role authorization', () => {
    const removeHandler = ProductsController.prototype.remove;

    it.each([Role.admin, Role.super_admin, Role.merchant_owner])(
      'allows role %s', (role) => {
        expect(checkRole(rolesGuard, removeHandler, role)).toBe(true);
      },
    );

    it.each([Role.merchant_accountant, Role.merchant_inventory, Role.merchant_data_entry])(
      'blocks role %s from delete', (role) => {
        expect(checkRole(rolesGuard, removeHandler, role)).toBe(false);
      },
    );
  });

  // ── PATCH :id — ownership enforcement ────────────────────────────────────

  describe('PATCH /products/:id — ownership via service', () => {
    it('returns updated product when product belongs to caller org', async () => {
      mockProductsService.update.mockResolvedValueOnce({ ...PRODUCT, notes: 'new note' });
      const result = await controller.update(233, { notes: 'new note' }, makeUser(Role.merchant_owner, 1));
      expect(result.notes).toBe('new note');
      expect(mockProductsService.update).toHaveBeenCalledWith(233, { notes: 'new note' }, 1, 42);
    });

    it('propagates NotFoundException when product belongs to different org', async () => {
      mockProductsService.update.mockRejectedValueOnce(new NotFoundException('Product not found'));
      await expect(
        controller.update(233, { notes: 'x' }, makeUser(Role.merchant_owner, 99)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── GET endpoints — no role restriction ───────────────────────────────────

  describe('GET endpoints — open to all authenticated roles', () => {
    it('findAll returns paginated products', async () => {
      const result = await controller.findAll({} as any, makeUser(Role.merchant_viewer));
      expect(result.items).toHaveLength(1);
      expect(mockProductsService.findAll).toHaveBeenCalledWith(1, {});
    });

    it('findOne returns single product', async () => {
      const result = await controller.findOne(233, makeUser(Role.merchant_viewer));
      expect(result.id).toBe(233);
    });
  });
});
