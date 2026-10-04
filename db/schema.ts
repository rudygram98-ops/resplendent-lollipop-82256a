import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const posts = pgTable('buzzly_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  content: text('content').notNull(),
  mediaKey: text('media_key'),
  mediaType: text('media_type'),
  mediaAlt: text('media_alt'),
  remixOf: uuid('remix_of').references((): AnyPgColumn => posts.id, { onDelete: 'set null' }),
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
  isPrivate: boolean('is_private').notNull().default(false),
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
  reviewTags: boolean('review_tags').notNull().default(false),
  allowDownloads: boolean('allow_downloads').notNull().default(true),
  allowRemixes: boolean('allow_remixes').notNull().default(true),
  quietMode: boolean('quiet_mode').notNull().default(false),
  quietStart: integer('quiet_start').notNull().default(1320),
  quietEnd: integer('quiet_end').notNull().default(420),
  timeZone: text('time_zone').notNull().default('UTC'),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  check('buzzly_member_settings_message_policy', sql`${table.messagePolicy} in ('everyone', 'following', 'nobody')`),
  check('buzzly_member_settings_screen_time', sql`${table.screenTimeMinutes} in (0, 30, 60, 120)`),
  check('buzzly_member_settings_hidden_words', sql`cardinality(${table.hiddenWords}) <= 50`),
  check('buzzly_member_settings_quiet_hours', sql`${table.quietStart} between 0 and 1439 and ${table.quietEnd} between 0 and 1439`),
])

export const followRequests = pgTable('buzzly_follow_requests', {
  requesterId: text('requester_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  targetId: text('target_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.requesterId, table.targetId] }),
  index('buzzly_follow_requests_target_idx').on(table.targetId, table.createdAt),
  check('buzzly_follow_requests_not_self', sql`${table.requesterId} <> ${table.targetId}`),
])

export const postTags = pgTable('buzzly_post_tags', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  isApproved: boolean('is_approved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.postId, table.userId] }), index('buzzly_post_tags_user_idx').on(table.userId, table.isApproved)])

export const notifications = pgTable('buzzly_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: text('recipient_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull().references(() => members.userId, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at', { withTimezone: true, precision: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  index('buzzly_notifications_recipient_idx').on(table.recipientId, table.createdAt, table.id),
  check('buzzly_notifications_type', sql`${table.type} in ('follow_request', 'follow_accepted', 'tag', 'comment', 'like', 'remix', 'message')`),
])

export const accounts = pgTable('buzzly_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  phone: text('phone').notNull().default(''),
  bio: text('bio').notNull().default(''),
  avatarUrl: text('avatar_url'),
  avatarAlt: text('avatar_alt').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [uniqueIndex('buzzly_accounts_email_idx').on(table.email)])

export const sessions = pgTable('buzzly_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [index('buzzly_sessions_account_idx').on(table.accountId)])
