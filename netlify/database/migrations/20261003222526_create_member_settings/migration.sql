CREATE TABLE "buzzly_member_settings" (
	"user_id" text PRIMARY KEY,
	"message_policy" text DEFAULT 'everyone' NOT NULL,
	"hidden_words" text[] DEFAULT '{}'::text[] NOT NULL,
	"screen_time_minutes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buzzly_member_settings_message_policy" CHECK ("message_policy" in ('everyone', 'following', 'nobody')),
	CONSTRAINT "buzzly_member_settings_screen_time" CHECK ("screen_time_minutes" in (0, 30, 60, 120)),
	CONSTRAINT "buzzly_member_settings_hidden_words" CHECK (cardinality("hidden_words") <= 50)
);
--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD CONSTRAINT "buzzly_member_settings_user_id_buzzly_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;