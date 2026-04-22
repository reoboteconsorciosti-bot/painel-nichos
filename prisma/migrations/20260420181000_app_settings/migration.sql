-- CreateTable
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- Seed default setting (optional)
INSERT INTO "app_settings" ("key", "value")
VALUES ('whatsapp_notify_number', '')
ON CONFLICT ("key") DO NOTHING;
