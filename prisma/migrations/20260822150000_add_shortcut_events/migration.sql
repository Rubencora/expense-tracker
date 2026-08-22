-- CreateTable
CREATE TABLE "shortcut_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_body" JSONB NOT NULL,
    "parsed_merchant" TEXT,
    "parsed_amount" DOUBLE PRECISION,
    "parsed_currency" TEXT,
    "amount_source" TEXT,
    "status" TEXT NOT NULL,
    "expense_id" TEXT,

    CONSTRAINT "shortcut_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shortcut_events_user_id_received_at_idx" ON "shortcut_events"("user_id", "received_at");

-- AddForeignKey
ALTER TABLE "shortcut_events" ADD CONSTRAINT "shortcut_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
