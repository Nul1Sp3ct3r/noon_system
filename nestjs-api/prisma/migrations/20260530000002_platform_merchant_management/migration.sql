-- Platform Merchant Management — additive migration only.
-- Adds platform_admin role, and SaaS layer models.
-- ALTER TYPE ADD VALUE runs outside any transaction to satisfy all Postgres versions.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'platform_admin';

-- ─── New enums ────────────────────────────────────────────────────────────────

CREATE TYPE "MerchantStatus"        AS ENUM ('trial','active','expired','suspended','cancelled');
CREATE TYPE "BillingCycle"          AS ENUM ('monthly','yearly');
CREATE TYPE "SubscriptionStatus"    AS ENUM ('active','expired','cancelled','paused','trial');
CREATE TYPE "PlatformPaymentStatus" AS ENUM ('paid','pending','failed','refunded');

-- ─── merchants ────────────────────────────────────────────────────────────────

CREATE TABLE "merchants" (
    "id"               SERIAL           NOT NULL,
    "business_name"    TEXT             NOT NULL,
    "owner_name"       TEXT,
    "email"            TEXT,
    "phone"            TEXT,
    "cr_number"        TEXT,
    "vat_number"       TEXT,
    "status"           "MerchantStatus" NOT NULL DEFAULT 'trial',
    "organization_id"  INTEGER,
    "notes"            TEXT,
    "created_at"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3),

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- ─── plans ────────────────────────────────────────────────────────────────────

CREATE TABLE "plans" (
    "id"            SERIAL        NOT NULL,
    "name"          TEXT          NOT NULL,
    "code"          TEXT          NOT NULL,
    "monthly_price" DECIMAL(10,2) NOT NULL,
    "yearly_price"  DECIMAL(10,2) NOT NULL,
    "features"      JSONB         NOT NULL DEFAULT '[]',
    "is_active"     BOOLEAN       NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- ─── subscriptions ────────────────────────────────────────────────────────────

CREATE TABLE "subscriptions" (
    "id"            SERIAL               NOT NULL,
    "merchant_id"   INTEGER              NOT NULL,
    "plan_id"       INTEGER              NOT NULL,
    "billing_cycle" "BillingCycle"       NOT NULL DEFAULT 'monthly',
    "start_date"    TIMESTAMP(3)         NOT NULL,
    "end_date"      TIMESTAMP(3),
    "status"        "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "auto_renew"    BOOLEAN              NOT NULL DEFAULT true,
    "price"         DECIMAL(10,2)        NOT NULL,
    "notes"         TEXT,
    "created_at"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- ─── platform_payments ────────────────────────────────────────────────────────

CREATE TABLE "platform_payments" (
    "id"              SERIAL                  NOT NULL,
    "merchant_id"     INTEGER                 NOT NULL,
    "subscription_id" INTEGER,
    "amount"          DECIMAL(10,2)           NOT NULL,
    "status"          "PlatformPaymentStatus" NOT NULL DEFAULT 'pending',
    "payment_method"  TEXT,
    "invoice_number"  TEXT,
    "notes"           TEXT,
    "paid_at"         TIMESTAMP(3),
    "created_at"      TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign keys ─────────────────────────────────────────────────────────────

ALTER TABLE "merchants"
    ADD CONSTRAINT "merchants_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_payments"
    ADD CONSTRAINT "platform_payments_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_payments"
    ADD CONSTRAINT "platform_payments_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Indices ──────────────────────────────────────────────────────────────────

CREATE INDEX "merchants_status_idx"          ON "merchants"("status");
CREATE INDEX "merchants_organization_id_idx" ON "merchants"("organization_id");
CREATE INDEX "subscriptions_merchant_id_idx" ON "subscriptions"("merchant_id");
CREATE INDEX "subscriptions_plan_id_idx"     ON "subscriptions"("plan_id");
CREATE INDEX "subscriptions_status_idx"      ON "subscriptions"("status");
CREATE INDEX "subscriptions_end_date_idx"    ON "subscriptions"("end_date");
CREATE INDEX "platform_payments_merchant_id_idx"     ON "platform_payments"("merchant_id");
CREATE INDEX "platform_payments_subscription_id_idx" ON "platform_payments"("subscription_id");
