-- AlterTable
ALTER TABLE "webhooks" ADD COLUMN     "events" TEXT[] DEFAULT ARRAY['expense.created']::TEXT[];
