import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const posts = pgTable('buzzly_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  content: text('content').notNull(),
  mediaKey: text('media_key'),
  mediaType: text('media_type'),
  mediaAlt: text('media_alt'),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [index('buzzly_posts_created_idx').on(table.createdAt, table.id), index('buzzly_posts_author_idx').on(table.authorId)])

export const likes = pgTable('buzzly_likes', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
}, (table) => [primaryKey({ columns: [table.postId, table.userId] })])

export const bookmarks = pgTable('buzzly_bookmarks', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
}, (table) => [primaryKey({ columns: [table.postId, table.userId] }), index('buzzly_bookmarks_user_idx').on(table.userId)])

export const comments = pgTable('buzzly_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [index('buzzly_comments_post_idx').on(table.postId, table.createdAt)])
