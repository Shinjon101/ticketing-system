CREATE TYPE "public"."seat_status" AS ENUM('available', 'held', 'booked');--> statement-breakpoint
CREATE TABLE "processed_events" (
	"message_id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"seat_number" text NOT NULL,
	"status" "seat_status" DEFAULT 'available' NOT NULL,
	"held_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
