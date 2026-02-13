CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"user_id" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
