CREATE TABLE "black_friday_campaigns" (
  "id" SERIAL NOT NULL,
  "year" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "nicho" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "starts_at" DATE NOT NULL,
  "ends_at" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "black_friday_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "black_friday_campaigns_year_key" ON "black_friday_campaigns"("year");
CREATE UNIQUE INDEX "black_friday_campaigns_nicho_key" ON "black_friday_campaigns"("nicho");

CREATE TABLE "black_friday_leads" (
  "id" SERIAL NOT NULL,
  "campaign_id" INTEGER NOT NULL,
  "lead_id" INTEGER NOT NULL,
  "supervisor_id" TEXT NOT NULL,
  "consultant_id" TEXT,
  "consultant_name" TEXT NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "crm_status" TEXT NOT NULL DEFAULT 'not_requested',
  CONSTRAINT "black_friday_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "black_friday_leads_lead_id_key" ON "black_friday_leads"("lead_id");
CREATE INDEX "idx_black_friday_campaign_supervisor" ON "black_friday_leads"("campaign_id", "supervisor_id");
CREATE INDEX "idx_black_friday_consultant" ON "black_friday_leads"("consultant_id");

ALTER TABLE "black_friday_leads"
  ADD CONSTRAINT "black_friday_leads_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "black_friday_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "black_friday_leads"
  ADD CONSTRAINT "black_friday_leads_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "black_friday_leads"
  ADD CONSTRAINT "black_friday_leads_consultant_id_fkey"
  FOREIGN KEY ("consultant_id") REFERENCES "consultants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "black_friday_campaigns" ("year", "name", "nicho", "is_active", "starts_at", "ends_at")
VALUES (2026, 'Black Friday 2026', 'black-friday-2026', true, DATE '2026-10-30', DATE '2026-11-30');
