-- CreateTable
CREATE TABLE "debt_note_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_note_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_note_items" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "debt_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_note_groups_user_id_year_month_idx" ON "debt_note_groups"("user_id", "year", "month");

-- CreateIndex
CREATE INDEX "debt_note_items_group_id_idx" ON "debt_note_items"("group_id");

-- AddForeignKey
ALTER TABLE "debt_note_groups" ADD CONSTRAINT "debt_note_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_note_items" ADD CONSTRAINT "debt_note_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "debt_note_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
