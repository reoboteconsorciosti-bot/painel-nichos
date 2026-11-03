ALTER TABLE "crm_deliveries" ALTER COLUMN "lead_id" DROP NOT NULL;
ALTER TABLE "crm_deliveries" DROP CONSTRAINT IF EXISTS "crm_deliveries_lead_id_key";
ALTER TABLE "crm_deliveries" ADD COLUMN "idempotency_key" TEXT;

UPDATE "crm_deliveries"
SET "idempotency_key" = 'existing:' || "id"::TEXT
WHERE "idempotency_key" IS NULL;

ALTER TABLE "crm_deliveries" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "crm_deliveries_idempotency_key_key" ON "crm_deliveries"("idempotency_key");
