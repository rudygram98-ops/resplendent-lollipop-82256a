import { sql } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

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

export const profiles = pgTable('buzzly_profiles', {
  userId: text('user_id').primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  avatarKey: text('avatar_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [uniqueIndex('buzzly_profiles_username_idx').on(sql`lower(${table.username})`)])

export const blocks = pgTable('buzzly_blocks', {
  blockerId: text('blocker_id').notNull(),
  blockedId: text('blocked_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] }), index('buzzly_blocks_blocked_idx').on(table.blockedId)])

export const conversations = pgTable('buzzly_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userA: text('user_a').notNull(),
  userB: text('user_b').notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  readA: timestamp('read_a', { withTimezone: true, precision: 3 }),
  readB: timestamp('read_b', { withTimezone: true, precision: 3 }),
}, (table) => [uniqueIndex('buzzly_conversations_pair_idx').on(table.userA, table.userB), index('buzzly_conversations_b_idx').on(table.userB)])

export const messages = pgTable('buzzly_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [index('buzzly_messages_conversation_idx').on(table.conversationId, table.createdAt)])
