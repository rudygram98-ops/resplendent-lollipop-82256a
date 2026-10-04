CREATE TABLE "buzzly_accounts" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"avatar_alt" text DEFAULT '' NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buzzly_sessions" (
	"token_hash" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "buzzly_accounts_email_idx" ON "buzzly_accounts" ("email");--> statement-breakpoint
CREATE INDEX "buzzly_sessions_account_idx" ON "buzzly_sessions" ("account_id");--> statement-breakpoint
ALTER TABLE "buzzly_sessions" ADD CONSTRAINT "buzzly_sessions_account_id_buzzly_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "buzzly_accounts"("id") ON DELETE CASCADE;