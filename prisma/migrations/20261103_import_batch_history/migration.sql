CREATE TABLE "import_batches" (
  "id" SERIAL NOT NULL,
  "file_name" TEXT NOT NULL,
  "niche" TEXT NOT NULL,
  "imported_count" INTEGER NOT NULL DEFAULT 0,
  "existing_count" INTEGER NOT NULL DEFAULT 0,
  "lead_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "fingerprint" TEXT NOT NULL,
  "removed_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undone_at" TIMESTAMP(3),
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "import_batches_fingerprint_key" ON "import_batches"("fingerprint");
CREATE INDEX "import_batches_created_at_idx" ON "import_batches"("created_at");
