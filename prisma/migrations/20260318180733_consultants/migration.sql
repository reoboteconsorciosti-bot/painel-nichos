-- CreateTable
CREATE TABLE "consultants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_consultants_supervisor_id" ON "consultants"("supervisor_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_consultants_supervisor_id_name" ON "consultants"("supervisor_id", "name");
