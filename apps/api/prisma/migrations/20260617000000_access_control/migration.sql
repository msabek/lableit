-- Access control: gate new accounts behind admin approval.
ALTER TABLE "users" ADD COLUMN "accessStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "users" ADD COLUMN "institution" TEXT;
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "useCase" TEXT;
ALTER TABLE "users" ADD COLUMN "requestedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "decidedAt" TIMESTAMP(3);

-- Existing accounts predate access control; grandfather them in as approved so
-- nobody who already had access is locked out by the new default of 'pending'.
UPDATE "users" SET "accessStatus" = 'approved';
