CREATE TABLE "buzzly_bookmarks" (
	"post_id" uuid,
	"user_id" text,
	CONSTRAINT "buzzly_bookmarks_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "buzzly_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"post_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buzzly_likes" (
	"post_id" uuid,
	"user_id" text,
	CONSTRAINT "buzzly_likes_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "buzzly_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"media_key" text,
	"media_type" text,
	"media_alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "buzzly_bookmarks_user_idx" ON "buzzly_bookmarks" ("user_id");--> statement-breakpoint
CREATE INDEX "buzzly_comments_post_idx" ON "buzzly_comments" ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "buzzly_posts_created_idx" ON "buzzly_posts" ("created_at","id");--> statement-breakpoint
CREATE INDEX "buzzly_posts_author_idx" ON "buzzly_posts" ("author_id");--> statement-breakpoint
ALTER TABLE "buzzly_bookmarks" ADD CONSTRAINT "buzzly_bookmarks_post_id_buzzly_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "buzzly_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_comments" ADD CONSTRAINT "buzzly_comments_post_id_buzzly_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "buzzly_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "buzzly_likes" ADD CONSTRAINT "buzzly_likes_post_id_buzzly_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "buzzly_posts"("id") ON DELETE CASCADE;