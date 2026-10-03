CREATE TABLE "buzzly_blocks" (
	"blocker_id" text,
	"blocked_id" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buzzly_blocks_pkey" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "buzzly_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"last_message_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"read_a" timestamp(3) with time zone,
	"read_b" timestamp(3) with time zone
);
--> statement-breakpoint
CREATE TABLE "buzzly_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buzzly_profiles" (
	"user_id" text PRIMARY KEY,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_key" text,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "buzzly_blocks_blocked_idx" ON "buzzly_blocks" ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buzzly_conversations_pair_idx" ON "buzzly_conversations" ("user_a","user_b");--> statement-breakpoint
CREATE INDEX "buzzly_conversations_b_idx" ON "buzzly_conversations" ("user_b");--> statement-breakpoint
CREATE INDEX "buzzly_messages_conversation_idx" ON "buzzly_messages" ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "buzzly_profiles_username_idx" ON "buzzly_profiles" (lower("username"));--> statement-breakpoint
ALTER TABLE "buzzly_messages" ADD CONSTRAINT "buzzly_messages_conversation_id_buzzly_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "buzzly_conversations"("id") ON DELETE CASCADE;