ALTER TYPE "public"."booking_status" ADD VALUE 'seat_held' BEFORE 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'payment_initiated' BEFORE 'confirmed';--> statement-breakpoint
ALTER TABLE "bookings" RENAME COLUMN "seat_id" TO "seat_ids";--> statement-breakpoint
ALTER TABLE "bookings" RENAME COLUMN "seat_number" TO "seat_numbers";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;