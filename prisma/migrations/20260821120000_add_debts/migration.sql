-- CreateEnum
CREATE TYPE "DebtKind" AS ENUM ('CREDIT_CARD', 'LOAN', 'PERSONAL', 'TAX', 'OTHER');

-- CreateTable
CREATE TABLE "debts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DebtKind" NOT NULL DEFAULT 'OTHER',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "credit_limit" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_entries" (
    "id" TEXT NOT NULL,
    "debt_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_months" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extra_income" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trm" DOUBLE PRECISION,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_months_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debts_user_id_idx" ON "debts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "debt_entries_debt_id_year_month_key" ON "debt_entries"("debt_id", "year", "month");

-- CreateIndex
CREATE INDEX "debt_entries_year_month_idx" ON "debt_entries"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "debt_months_user_id_year_month_key" ON "debt_months"("user_id", "year", "month");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_months" ADD CONSTRAINT "debt_months_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
