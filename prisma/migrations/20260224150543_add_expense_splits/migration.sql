-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('EQUAL', 'PERCENTAGE', 'EXACT', 'SOLO');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "split_type" "SplitType";

-- CreateTable
CREATE TABLE "expense_splits" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "paid_by_user_id" TEXT NOT NULL,
    "owed_by_user_id" TEXT NOT NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "is_settled" BOOLEAN NOT NULL DEFAULT false,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_splits_expense_id_idx" ON "expense_splits"("expense_id");

-- CreateIndex
CREATE INDEX "expense_splits_owed_by_user_id_is_settled_idx" ON "expense_splits"("owed_by_user_id", "is_settled");

-- CreateIndex
CREATE INDEX "expense_splits_paid_by_user_id_idx" ON "expense_splits"("paid_by_user_id");

-- CreateIndex
CREATE INDEX "settlements_space_id_idx" ON "settlements"("space_id");

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_owed_by_user_id_fkey" FOREIGN KEY ("owed_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
