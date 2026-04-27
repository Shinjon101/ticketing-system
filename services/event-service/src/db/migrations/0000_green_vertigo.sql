CREATE TYPE "public"."event_status" AS ENUM('draft', 'active', 'cancelled');--> statement-breakpoint
CREATE TABLE "evemts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"venue" text NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"total_seats" integer NOT NULL,
	"price" integer NOT NULL,
	"sale_starts_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
