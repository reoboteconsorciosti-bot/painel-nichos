CREATE TABLE "distribution_audit" (
  "id" SERIAL NOT NULL,
  "action" TEXT NOT NULL,
  "requested_by_id" TEXT NOT NULL,
  "requested_by_name" TEXT NOT NULL,
  "requested_by_email" TEXT,
  "requested_by_role" TEXT NOT NULL,
  "consultant_id" TEXT NOT NULL,
  "consultant_crm_id" TEXT,
  "consultant_name" TEXT NOT NULL,
  "niche" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "state" TEXT,
  "city" TEXT,
  "crm_requested" BOOLEAN NOT NULL DEFAULT false,
  "list_id" INTEGER,
  "campaign_id" INTEGER,
  "campaign_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "distribution_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_distribution_audit_requester_id" ON "distribution_audit"("requested_by_id", "id");
