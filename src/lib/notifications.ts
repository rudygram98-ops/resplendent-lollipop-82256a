import { useCallback, useEffect, useState } from 'react'

export type NotificationType = 'follow_request' | 'follow_accepted' | 'tag' | 'comment' | 'like' | 'remix' | 'message'

export interface BuzzlyNotification {
  id: string
  type: NotificationType
  postId: string | null
  createdAt: string
  read: boolean
  actor: { id: string; name: string }
  pending: boolean
}

export interface NotificationSummary {
  unread: number
  alerts: number
  quiet: boolean
}

export async function notificationsRequest<ResponseData>(path: string, options?: RequestInit): Promise<ResponseData> {
  const response = await fetch(`/api/notifications${path}`, { ...options, credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session has expired. Sign in again to continue.')
    if (response.status === 429) throw new Error('A little too fast. Wait a minute and try again.')
    throw new Error(data?.error || 'Notifications are temporarily unavailable. Please try again.')
  }
  return data as ResponseData
}

export function useNotificationSummary(userId: string) {
  const [summary, setSummary] = useState<NotificationSummary>({ unread: 0, alerts: 0, quiet: false })

  const refresh = useCallback(() => {
    void notificationsRequest<NotificationSummary>('/summary').then(setSummary).catch(() => undefined)
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [userId, refresh])

  return { summary, refresh }
}
