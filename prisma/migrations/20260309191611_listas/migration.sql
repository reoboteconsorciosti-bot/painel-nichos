-- DropIndex
DROP INDEX "idx_leads_phone";

-- AlterTable
ALTER TABLE "import_logs" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "listas" (
    "id" SERIAL NOT NULL,
    "consultor_id" INTEGER NOT NULL,
    "nicho" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_leads" (
    "id" SERIAL NOT NULL,
    "lista_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,

    CONSTRAINT "lista_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_listas_consultor_id" ON "listas"("consultor_id");

-- CreateIndex
CREATE INDEX "idx_listas_nicho" ON "listas"("nicho");

-- CreateIndex
CREATE INDEX "idx_lista_leads_lead_id" ON "lista_leads"("lead_id");

-- CreateIndex
CREATE INDEX "idx_lista_leads_lista_id" ON "lista_leads"("lista_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lista_leads_lista_id_lead_id" ON "lista_leads"("lista_id", "lead_id");

-- AddForeignKey
ALTER TABLE "lista_leads" ADD CONSTRAINT "lista_leads_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "listas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_leads" ADD CONSTRAINT "lista_leads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
