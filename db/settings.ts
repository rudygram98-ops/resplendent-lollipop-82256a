import { eq, ilike, not, or } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { getDatabase } from './index.js'
import { memberSettings } from './schema.js'

export const messagePolicies = ['everyone', 'following', 'nobody'] as const
export const screenTimeOptions = [0, 30, 60, 120] as const

export const defaultSettings = { messagePolicy: 'everyone' as (typeof messagePolicies)[number], hiddenWords: [] as string[], screenTimeMinutes: 0 }

export async function readSettings(db: ReturnType<typeof getDatabase>, userId: string) {
  const [row] = await db.select({ messagePolicy: memberSettings.messagePolicy, hiddenWords: memberSettings.hiddenWords, screenTimeMinutes: memberSettings.screenTimeMinutes }).from(memberSettings).where(eq(memberSettings.userId, userId)).limit(1)
  return row ? { ...row, messagePolicy: row.messagePolicy as (typeof messagePolicies)[number] } : defaultSettings
}

export function withoutHiddenWords(column: AnyPgColumn, words: string[]) {
  if (!words.length) return undefined
  return not(or(...words.map((word) => ilike(column, `%${word.replace(/[\\%_]/g, '\\$&')}%`)))!)
}
