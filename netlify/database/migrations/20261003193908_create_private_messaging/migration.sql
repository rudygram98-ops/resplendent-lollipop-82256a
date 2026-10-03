CREATE TABLE "buzzly_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"member_one" text NOT NULL,
	"member_two" text NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buzzly_conversations_ordered_pair" CHECK ("member_one" < "member_two")
);
--> statement-breakpoint
CREATE TABLE "buzzly_direct_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buzzly_direct_messages_content_length" CHECK (char_length("content") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "buzzly_follows" (
	"follower_id" text,
	"following_id" text,
	CONSTRAINT "buzzly_follows_pkey" PRIMARY KEY("follower_id","following_id"),
	CONSTRAINT "buzzly_follows_not_self" CHECK ("follower_id" <> "following_id")
);
--> statement-breakpoint
CREATE TABLE "buzzly_members" (
	"user_id" text PRIMARY KEY,
	"display_name" text NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "buzzly_conversations_pair_idx" ON "buzzly_conversations" ("member_one","member_two");--> statement-breakpoint
CREATE INDEX "buzzly_conversations_one_idx" ON "buzzly_conversations" ("member_one","updated_at","id");--> statement-breakpoint
CREATE INDEX "buzzly_conversations_two_idx" ON "buzzly_conversations" ("member_two","updated_at","id");--> statement-breakpoint
CREATE INDEX "buzzly_direct_messages_thread_idx" ON "buzzly_direct_messages" ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "buzzly_direct_messages_retry_idx" ON "buzzly_direct_messages" ("sender_id","client_id");--> statement-breakpoint
ALTER TABLE "buzzly_conversations" ADD CONSTRAINT "buzzly_conversations_member_one_buzzly_members_user_id_fkey" FOREIGN KEY ("member_one") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_conversations" ADD CONSTRAINT "buzzly_conversations_member_two_buzzly_members_user_id_fkey" FOREIGN KEY ("member_two") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_direct_messages" ADD CONSTRAINT "buzzly_direct_messages_FO5XL944ejvX_fkey" FOREIGN KEY ("conversation_id") REFERENCES "buzzly_conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_direct_messages" ADD CONSTRAINT "buzzly_direct_messages_sender_id_buzzly_members_user_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_follows" ADD CONSTRAINT "buzzly_follows_follower_id_buzzly_members_user_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_follows" ADD CONSTRAINT "buzzly_follows_following_id_buzzly_members_user_id_fkey" FOREIGN KEY ("following_id") REFERENCES "buzzly_members"("user_id") ON DELETE CASCADE;