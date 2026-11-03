ALTER TABLE "leads"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "job_title" TEXT,
  ADD COLUMN "deal_description" TEXT,
  ADD COLUMN "crm_deal_id" TEXT;

CREATE TABLE "crm_deliveries" (
  "id" SERIAL PRIMARY KEY,
  "lead_id" INTEGER NOT NULL UNIQUE REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "lista_id" INTEGER REFERENCES "listas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "consultant_crm_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "method" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "crm_deal_id" TEXT,
  "error" TEXT,
  "warnings" JSONB,
  "attempted_at" TIMESTAMP(3),
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "idx_crm_deliveries_pending" ON "crm_deliveries"("status", "next_attempt_at");
CREATE INDEX "idx_crm_deliveries_lista" ON "crm_deliveries"("lista_id");
