ALTER TABLE "listas" ADD COLUMN "crm_consultant_id" TEXT;
ALTER TABLE "consultants" ADD COLUMN "crm_member_id" TEXT;

DROP INDEX IF EXISTS "uq_consultants_supervisor_id_name";
CREATE UNIQUE INDEX "uq_consultants_crm_member_id" ON "consultants"("crm_member_id");

CREATE INDEX "idx_listas_crm_consultant_created_at"
ON "listas"("crm_consultant_id", "created_at");

CREATE TABLE "consultant_quotas" (
  "crm_user_id" TEXT NOT NULL,
  "monthly_limit" INTEGER NOT NULL DEFAULT 300,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consultant_quotas_pkey" PRIMARY KEY ("crm_user_id")
);

CREATE TABLE "consultant_monthly_usage" (
  "id" SERIAL NOT NULL,
  "crm_user_id" TEXT NOT NULL,
  "month_start" DATE NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consultant_monthly_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_consultant_monthly_usage_user_month"
ON "consultant_monthly_usage"("crm_user_id", "month_start");

CREATE INDEX "idx_consultant_monthly_usage_month"
ON "consultant_monthly_usage"("month_start");
