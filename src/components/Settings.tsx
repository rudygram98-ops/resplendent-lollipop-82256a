import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { logout, updateUser } from '@netlify/identity'
import type { User } from '@netlify/identity'
import { AtSign, Ban, Camera, Check, LockKeyhole, LogOut, Mail, Phone, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { authErrorMessage } from '@/lib/auth'
import { apiRequest, errorText, jsonOptions } from '@/lib/social'
import type { PublicProfile } from '@/lib/social'
import Avatar from '@/components/Avatar'
import Field from '@/components/Field'

type Status = { error?: string; notice?: string }

function StatusLine({ status }: { status: Status }) {
  if (status.error) return <p className="social-error" role="alert">{status.error}</p>
  if (status.notice) return <p className="social-notice" role="status"><Check size={14} />{status.notice}</p>
  return null
}

export default function Settings({ user, profile, onProfileChange, onUserChange }: {
  user: User
  profile: PublicProfile | null
  onProfileChange: (profile: PublicProfile) => void
  onUserChange: (user: User) => void
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName || user.name || '')
  const [username, setUsername] = useState(profile?.username || '')
  const [email, setEmail] = useState(user.email || '')
  const [phone, setPhone] = useState(typeof user.userMetadata?.phone === 'string' ? user.userMetadata.phone : '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [blocked, setBlocked] = useState<PublicProfile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, Status>>({})
  const avatarInput = useRef<HTMLInputElement>(null)
  const lock = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<{ profile: PublicProfile; blocked: PublicProfile[] }>('/api/profile/me', { signal: controller.signal }).then((result) => {
      setBlocked(result.blocked)
      onProfileChange(result.profile)
      setDisplayName(result.profile.displayName)
      setUsername(result.profile.username)
    }).catch((failure) => { if (!controller.signal.aborted) setStatus((current) => ({ ...current, blocked: { error: errorText(failure, 'Could not load your settings.') } })) })
    return () => controller.abort()
  }, [])

  async function run(section: string, task: () => Promise<string>) {
    if (lock.current) return
    lock.current = true
    setBusy(section)
    setStatus((current) => ({ ...current, [section]: {} }))
    try {
      const notice = await task()
      setStatus((current) => ({ ...current, [section]: { notice } }))
    } catch (failure) {
      setStatus((current) => ({ ...current, [section]: { error: failure instanceof Error && !('status' in failure) ? failure.message : authErrorMessage(failure) } }))
    } finally {
      lock.current = false
      setBusy(null)
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run('profile', async () => {
      const handle = username.trim().replace(/^@/, '').toLowerCase()
      if (displayName.trim().length < 2) throw new Error('Use at least 2 characters for your display name.')
      if (!/^[a-z0-9_]{3,20}$/.test(handle)) throw new Error('Usernames use 3 to 20 lowercase letters, numbers, or underscores.')
      const result = await apiRequest<{ profile: PublicProfile }>('/api/profile/me', jsonOptions('PUT', { username: handle, displayName: displayName.trim() }))
      onProfileChange(result.profile)
      setUsername(result.profile.username)
      if (user.name !== result.profile.displayName) onUserChange(await updateUser({ data: { full_name: result.profile.displayName } }))
      return 'Your profile is updated.'
    })
  }

  function changeAvatar(file?: File) {
    if (avatarInput.current) avatarInput.current.value = ''
    if (!file) return
    void run('avatar', async () => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP photo.')
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a profile picture under 2 MB.')
      const body = new FormData()
      body.set('avatar', file)
      const result = await apiRequest<{ profile: PublicProfile }>('/api/profile/me/avatar', { method: 'PUT', body })
      onProfileChange(result.profile)
      return 'Looking good! Your new profile picture is live.'
    })
  }

  function removeAvatar() {
    void run('avatar', async () => {
      const result = await apiRequest<{ profile: PublicProfile }>('/api/profile/me/avatar', { method: 'DELETE' })
      onProfileChange(result.profile)
      return 'Your profile picture is removed.'
    })
  }

  function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run('contact', async () => {
      const nextEmail = email.trim()
      const nextPhone = phone.trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) throw new Error('Enter a valid email address.')
      if (nextPhone && !/^\+?[0-9][0-9 ().-]{5,19}$/.test(nextPhone)) throw new Error('Enter a valid phone number, like +1 555 123 4567.')
      const updates: Record<string, unknown> = {}
      const emailChanged = nextEmail.toLowerCase() !== (user.email || '').toLowerCase()
      if (emailChanged) updates.email = nextEmail
      if (nextPhone !== (user.userMetadata?.phone || '')) updates.data = { phone: nextPhone }
      if (!Object.keys(updates).length) return 'Nothing to update.'
      const updated = await updateUser(updates)
      onUserChange(updated)
      if (emailChanged) {
        setEmail(updated.email || user.email || '')
        return `Check ${nextEmail} for a confirmation link. Your email changes once you confirm it.`
      }
      return 'Your phone number is saved.'
    })
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run('password', async () => {
      if (password.length < 8) throw new Error('Use at least 8 characters.')
      if (password !== confirm) throw new Error('Your passwords don’t match.')
      onUserChange(await updateUser({ password }))
      setPassword('')
      setConfirm('')
      return 'Your password is updated.'
    })
  }

  function unblock(person: PublicProfile) {
    void run('blocked', async () => {
      await apiRequest(`/api/profile/blocks/${encodeURIComponent(person.userId)}`, { method: 'DELETE' })
      setBlocked((current) => current?.filter((item) => item.userId !== person.userId) || null)
      return `${person.displayName} is unblocked.`
    })
  }

  function signOut() {
    void run('session', async () => {
      await logout()
      return 'Signed out.'
    })
  }

  const name = profile?.displayName || user.name || 'Buzzly member'
  return <div className="settings">
    <section className="settings-card" aria-labelledby="settings-profile">
      <h2 id="settings-profile">Your profile</h2>
      <p className="settings-hint">This is how other members see you around Buzzly.</p>
      <div className="avatar-editor">
        <Avatar name={name} url={profile?.avatarUrl} size="large" />
        <div>
          <input ref={avatarInput} className="sr-only" id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => changeAvatar(event.target.files?.[0])} disabled={Boolean(busy)} />
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => avatarInput.current?.click()}><Camera size={16} />{busy === 'avatar' ? 'Uploading…' : profile?.avatarUrl ? 'Change photo' : 'Add a photo'}</button>
          {profile?.avatarUrl && <button type="button" className="text-button" disabled={Boolean(busy)} onClick={removeAvatar}><Trash2 size={13} />Remove</button>}
          <small>JPG, PNG, or WebP · up to 2 MB</small>
        </div>
      </div>
      <StatusLine status={status.avatar || {}} />
      <form onSubmit={saveProfile} noValidate>
        <Field label="Display name" name="settings-name" icon={UserRound} value={displayName} onChange={setDisplayName} placeholder="Your name" autoComplete="name" maxLength={60} disabled={Boolean(busy)} />
        <Field label="Username" name="settings-username" icon={AtSign} value={username} onChange={setUsername} placeholder="your_username" autoComplete="username" maxLength={21} disabled={Boolean(busy)} />
        <p className="settings-hint">3–20 lowercase letters, numbers, or underscores. People can find and message you by username.</p>
        <StatusLine status={status.profile || {}} />
        <button className="primary-button" type="submit" disabled={Boolean(busy)}>{busy === 'profile' ? 'Saving…' : 'Save profile'}<Check size={16} /></button>
      </form>
    </section>

    <section className="settings-card" aria-labelledby="settings-contact">
      <h2 id="settings-contact">Email & phone</h2>
      <p className="settings-hint"><ShieldCheck size={13} />Private to you. Never shown on your profile.</p>
      <form onSubmit={saveContact} noValidate>
        <Field label="Email address" name="settings-email" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" maxLength={254} disabled={Boolean(busy)} />
        {user.pendingEmail && <p className="settings-hint">Waiting for you to confirm <strong>{user.pendingEmail}</strong>.</p>}
        <Field label="Phone number (optional)" name="settings-phone" icon={Phone} type="tel" value={phone} onChange={setPhone} placeholder="+1 555 123 4567" autoComplete="tel" maxLength={20} disabled={Boolean(busy)} />
        <StatusLine status={status.contact || {}} />
        <button className="primary-button" type="submit" disabled={Boolean(busy)}>{busy === 'contact' ? 'Saving…' : 'Save contact details'}<Check size={16} /></button>
      </form>
    </section>

    <section className="settings-card" aria-labelledby="settings-password">
      <h2 id="settings-password">Password</h2>
      <form onSubmit={savePassword} noValidate>
        <Field label="New password" name="settings-password" icon={LockKeyhole} type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" disabled={Boolean(busy)} />
        <Field label="Confirm new password" name="settings-confirm" icon={LockKeyhole} type="password" value={confirm} onChange={setConfirm} placeholder="One more time" autoComplete="new-password" disabled={Boolean(busy)} />
        <StatusLine status={status.password || {}} />
        <button className="primary-button" type="submit" disabled={Boolean(busy)}>{busy === 'password' ? 'Updating…' : 'Update password'}<Check size={16} /></button>
      </form>
    </section>

    <section className="settings-card" aria-labelledby="settings-blocked">
      <h2 id="settings-blocked">Blocked members</h2>
      <p className="settings-hint"><Ban size={13} />Blocked members can’t message you, and you won’t see each other’s posts or comments.</p>
      {blocked === null && !status.blocked?.error && <p className="social-muted" role="status">Loading…</p>}
      {blocked?.length === 0 && <p className="social-muted">You haven’t blocked anyone.</p>}
      {Boolean(blocked?.length) && <ul className="people-list">{blocked?.map((person) => <li key={person.userId}><Avatar name={person.displayName} url={person.avatarUrl} /><span><strong>{person.displayName}</strong><small>@{person.username}</small></span><button className="secondary-button" disabled={Boolean(busy)} onClick={() => unblock(person)}>Unblock</button></li>)}</ul>}
      <StatusLine status={status.blocked || {}} />
    </section>

    <section className="settings-card" aria-labelledby="settings-session">
      <h2 id="settings-session">Session</h2>
      <p className="settings-hint">Signed in as {user.email}. Always sign out on shared devices.</p>
      <StatusLine status={status.session || {}} />
      <button className="signout-button" disabled={Boolean(busy)} onClick={signOut}><LogOut size={16} />{busy === 'session' ? 'Signing out…' : 'Sign out'}</button>
    </section>
  </div>
}
