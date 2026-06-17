CREATE TABLE IF NOT EXISTS "system_banner" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"actif" boolean NOT NULL DEFAULT false,
	"message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_banner_singleton" CHECK ("id" = 1)
);

INSERT INTO "system_banner" ("id", "actif", "message")
VALUES (1, false, null)
ON CONFLICT ("id") DO NOTHING;
