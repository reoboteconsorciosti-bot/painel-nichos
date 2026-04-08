-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "nicho" TEXT;

-- CreateIndex
CREATE INDEX "idx_leads_nicho" ON "leads"("nicho");

-- CreateIndex
CREATE INDEX "idx_leads_nicho_state_city" ON "leads"("nicho", "state", "city");
