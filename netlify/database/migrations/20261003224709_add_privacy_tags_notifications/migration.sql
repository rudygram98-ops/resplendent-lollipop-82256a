CREATE TABLE "buzzly_follow_requests" (
	"requester_id" text,
	"target_id" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buzzly_follow_requests_pkey" PRIMARY KEY("requester_id","target_id"),
	CONSTRAINT "buzzly_follow_requests_not_self" CHECK ("requester_id" <> "target_id")
);
--> statement-breakpoint
CREATE TABLE "buzzly_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipient_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"post_id" uuid,
	"read_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buzzly_notifications_type" CHECK ("type" in ('follow_request', 'follow_accepted', 'tag', 'comment', 'like', 'remix', 'message'))
);
--> statement-breakpoint
CREATE TABLE "buzzly_post_tags" (
	"post_id" uuid,
	"user_id" text,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buzzly_post_tags_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD COLUMN "review_tags" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD COLUMN "allow_downloads" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD COLUMN "allow_remixes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD COLUMN "quiet_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD COLUMN "quiet_start" integer DEFAULT 1320 NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD COLUMN "quiet_end" integer DEFAULT 420 NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_members" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "buzzly_posts" ADD COLUMN "remix_of" uuid;--> statement-breakpoint
CREATE INDEX "buzzly_follow_requests_target_idx" ON "buzzly_follow_requests" ("target_id","created_at");--> statement-breakpoint
CREATE INDEX "buzzly_notifications_recipient_idx" ON "buzzly_notifications" ("recipient_id","created_at","id");--> statement-breakpoint
CREATE INDEX "buzzly_post_tags_user_idx" ON "buzzly_post_tags" ("user_id","is_approved");--> statement-breakpoint
ALTER TABLE "buzzly_follow_requests" ADD CONSTRAINT "buzzly_follow_requests_requester_id_buzzly_members_user_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_follow_requests" ADD CONSTRAINT "buzzly_follow_requests_target_id_buzzly_members_user_id_fkey" FOREIGN KEY ("target_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_notifications" ADD CONSTRAINT "buzzly_notifications_recipient_id_buzzly_members_user_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_notifications" ADD CONSTRAINT "buzzly_notifications_actor_id_buzzly_members_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_notifications" ADD CONSTRAINT "buzzly_notifications_post_id_buzzly_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "buzzly_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_post_tags" ADD CONSTRAINT "buzzly_post_tags_post_id_buzzly_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "buzzly_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_post_tags" ADD CONSTRAINT "buzzly_post_tags_user_id_buzzly_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_posts" ADD CONSTRAINT "buzzly_posts_remix_of_buzzly_posts_id_fkey" FOREIGN KEY ("remix_of") REFERENCES "buzzly_posts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "buzzly_member_settings" ADD CONSTRAINT "buzzly_member_settings_quiet_hours" CHECK ("quiet_start" between 0 and 1439 and "quiet_end" between 0 and 1439);