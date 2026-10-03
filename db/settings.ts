import { eq, ilike, not, or, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { getDatabase } from './index.js'
import { follows, memberSettings, members, postTags, posts } from './schema.js'

export const messagePolicies = ['everyone', 'following', 'nobody'] as const
export const screenTimeOptions = [0, 30, 60, 120] as const

export const defaultSettings = {
  messagePolicy: 'everyone' as (typeof messagePolicies)[number],
  hiddenWords: [] as string[],
  screenTimeMinutes: 0,
  reviewTags: false,
  allowDownloads: true,
  allowRemixes: true,
  quietMode: false,
  quietStart: 1320,
  quietEnd: 420,
  timeZone: 'UTC',
}

export async function readSettings(db: ReturnType<typeof getDatabase>, userId: string) {
  const [row] = await db.select({
    messagePolicy: memberSettings.messagePolicy, hiddenWords: memberSettings.hiddenWords, screenTimeMinutes: memberSettings.screenTimeMinutes,
    reviewTags: memberSettings.reviewTags, allowDownloads: memberSettings.allowDownloads, allowRemixes: memberSettings.allowRemixes,
    quietMode: memberSettings.quietMode, quietStart: memberSettings.quietStart, quietEnd: memberSettings.quietEnd, timeZone: memberSettings.timeZone,
  }).from(memberSettings).where(eq(memberSettings.userId, userId)).limit(1)
  return row ? { ...row, messagePolicy: row.messagePolicy as (typeof messagePolicies)[number] } : defaultSettings
}

export function isValidTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true } catch { return false }
}

export function isQuietNow(settings: { quietMode: boolean; quietStart: number; quietEnd: number; timeZone: string }, now = new Date()) {
  if (!settings.quietMode || settings.quietStart === settings.quietEnd) return false
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: isValidTimeZone(settings.timeZone) ? settings.timeZone : 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const minutes = Number(parts.find((part) => part.type === 'hour')?.value) * 60 + Number(parts.find((part) => part.type === 'minute')?.value)
  return settings.quietStart < settings.quietEnd
    ? minutes >= settings.quietStart && minutes < settings.quietEnd
    : minutes >= settings.quietStart || minutes < settings.quietEnd
}

export function containsHiddenWord(content: string, words: string[]) {
  const text = content.toLowerCase()
  return words.some((word) => text.includes(word))
}

export function withoutHiddenWords(column: AnyPgColumn, words: string[]) {
  if (!words.length) return undefined
  return not(or(...words.map((word) => ilike(column, `%${word.replace(/[\\%_]/g, '\\$&')}%`)))!)
}

export function canViewPost(viewerId: string, authorColumn: AnyPgColumn = posts.authorId, postColumn: AnyPgColumn = posts.id) {
  return sql<boolean>`(${authorColumn} = ${viewerId}
    or not exists (select 1 from ${members} where ${members.userId} = ${authorColumn} and ${members.isPrivate})
    or exists (select 1 from ${follows} where ${follows.followerId} = ${viewerId} and ${follows.followingId} = ${authorColumn})
    or exists (select 1 from ${postTags} where ${postTags.postId} = ${postColumn} and ${postTags.userId} = ${viewerId}))`
}

export function authorAllows(setting: 'allowDownloads' | 'allowRemixes', authorColumn: AnyPgColumn = posts.authorId) {
  return sql<boolean>`coalesce((select ${memberSettings[setting]} from ${memberSettings} where ${memberSettings.userId} = ${authorColumn}), true)`
}
