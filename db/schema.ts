import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

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

export const members = pgTable('buzzly_members', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
})

export const follows = pgTable('buzzly_follows', {
  followerId: text('follower_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  followingId: text('following_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.followerId, table.followingId] }), check('buzzly_follows_not_self', sql`${table.followerId} <> ${table.followingId}`)])

export const conversations = pgTable('buzzly_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberOne: text('member_one').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  memberTwo: text('member_two').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('buzzly_conversations_pair_idx').on(table.memberOne, table.memberTwo),
  index('buzzly_conversations_one_idx').on(table.memberOne, table.updatedAt, table.id),
  index('buzzly_conversations_two_idx').on(table.memberTwo, table.updatedAt, table.id),
  check('buzzly_conversations_ordered_pair', sql`${table.memberOne} < ${table.memberTwo}`),
])

export const directMessages = pgTable('buzzly_direct_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  index('buzzly_direct_messages_thread_idx').on(table.conversationId, table.createdAt, table.id),
  uniqueIndex('buzzly_direct_messages_retry_idx').on(table.senderId, table.clientId),
  check('buzzly_direct_messages_content_length', sql`char_length(${table.content}) between 1 and 2000`),
])

export const memberSettings = pgTable('buzzly_member_settings', {
  userId: text('user_id').primaryKey().references(() => members.userId, { onDelete: 'cascade' }),
  messagePolicy: text('message_policy').notNull().default('everyone'),
  hiddenWords: text('hidden_words').array().notNull().default(sql`'{}'::text[]`),
  screenTimeMinutes: integer('screen_time_minutes').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  check('buzzly_member_settings_message_policy', sql`${table.messagePolicy} in ('everyone', 'following', 'nobody')`),
  check('buzzly_member_settings_screen_time', sql`${table.screenTimeMinutes} in (0, 30, 60, 120)`),
  check('buzzly_member_settings_hidden_words', sql`cardinality(${table.hiddenWords}) <= 50`),
])
