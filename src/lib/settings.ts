import { useEffect, useState } from 'react'
import { readLocal, writeLocal } from '@/lib/storage'

export type MessagePolicy = 'everyone' | 'following' | 'nobody'

export interface MemberSettings {
  messagePolicy: MessagePolicy
  hiddenWords: string[]
  screenTimeMinutes: number
  isPrivate: boolean
  reviewTags: boolean
  allowDownloads: boolean
  allowRemixes: boolean
  quietMode: boolean
  quietStart: number
  quietEnd: number
  timeZone: string
}

export interface SettingsResponse extends MemberSettings {
  quietNow: boolean
  pendingRequests: number
}

export async function settingsRequest(options?: RequestInit): Promise<SettingsResponse> {
  const response = await fetch('/api/settings', { ...options, credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session has expired. Sign in again to continue.')
    if (response.status === 429) throw new Error('A little too fast. Wait a minute and try again.')
    throw new Error(data?.error || 'Settings are temporarily unavailable. Please try again.')
  }
  return data as SettingsResponse
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : null
}

export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

export function parseHiddenWords(value: string) {
  return [...new Set(value.split(',').map((word) => word.trim().toLowerCase()).filter(Boolean))]
}

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function readUsage(key: string) {
  try {
    const usage = JSON.parse(readLocal(key) || 'null') as { date?: unknown; seconds?: unknown; dismissed?: unknown } | null
    if (usage && usage.date === today() && typeof usage.seconds === 'number') return { date: today(), seconds: usage.seconds, dismissed: usage.dismissed === true }
  } catch {}
  return { date: today(), seconds: 0, dismissed: false }
}

export function useScreenTimeReminder(userId: string, limitMinutes: number) {
  const key = `usage:${userId}`
  const [due, setDue] = useState(false)

  useEffect(() => {
    if (!limitMinutes) { setDue(false); return }
    const step = 15
    const check = (add: number) => {
      const usage = readUsage(key)
      usage.seconds += add
      writeLocal(key, JSON.stringify(usage))
      setDue(!usage.dismissed && usage.seconds >= limitMinutes * 60)
    }
    check(0)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') check(step) }, step * 1000)
    return () => window.clearInterval(timer)
  }, [key, limitMinutes])

  function dismiss() {
    writeLocal(key, JSON.stringify({ ...readUsage(key), dismissed: true }))
    setDue(false)
  }

  return { due, dismiss }
}
