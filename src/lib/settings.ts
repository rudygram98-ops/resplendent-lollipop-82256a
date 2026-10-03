import { useEffect, useState } from 'react'
import { readLocal, writeLocal } from '@/lib/storage'

export type MessagePolicy = 'everyone' | 'following' | 'nobody'

export interface MemberSettings {
  messagePolicy: MessagePolicy
  hiddenWords: string[]
  screenTimeMinutes: number
}

export async function settingsRequest(options?: RequestInit): Promise<MemberSettings> {
  const response = await fetch('/api/settings', { ...options, credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session has expired. Sign in again to continue.')
    if (response.status === 429) throw new Error('A little too fast. Wait a minute and try again.')
    throw new Error(data?.error || 'Settings are temporarily unavailable. Please try again.')
  }
  return data as MemberSettings
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
