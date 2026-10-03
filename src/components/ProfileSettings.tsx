import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { AuthError, getUser, updateUser } from '@netlify/identity'
import type { User } from '@netlify/identity'
import { Check, ImagePlus } from 'lucide-react'
import { initials } from '@/lib/social'

function metadataText(user: User, key: string) {
  const value = user.userMetadata?.[key]
  return typeof value === 'string' ? value : ''
}

async function avatarRequest(path: string, options: RequestInit) {
  const response = await fetch(path, { ...options, credentials: 'same-origin' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Unable to save your photo. Please try again.')
  return data as { avatarUrl: string }
}

export default function ProfileSettings({ user, onSaved, onCancel, onBusyChange }: {
  user: User
  onSaved: (user: User, message: string) => void
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [profile, setProfile] = useState({ username: user.name || '', email: user.pendingEmail || user.email || '', phone: metadataText(user, 'phone'), bio: metadataText(user, 'bio'), avatarAlt: metadataText(user, 'avatar_alt') })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitLock = useRef(false)

  useEffect(() => {
    if (!file) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target
    setProfile((current) => ({ ...current, [name]: value }))
    setError('')
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    setError('')
    if (!selected) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size === 0 || selected.size > 4 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP photo up to 4 MB.')
      event.target.value = ''
      return
    }
    setFile(selected)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current) return
    if (profile.username.trim().length < 2) { setError('Use at least 2 characters for your username.'); return }
    if (profile.phone.trim() && !/^\+?[\d\s().-]{7,30}$/.test(profile.phone.trim())) { setError('Enter a valid phone number, or leave it blank.'); return }
    if (file && !profile.avatarAlt.trim()) { setError('Add a description for your profile photo.'); return }
    submitLock.current = true
    setBusy(true)
    onBusyChange(true)
    setError('')
    let uploadedUrl = ''
    try {
      const currentUser = await getUser()
      if (!currentUser || currentUser.id !== user.id) throw new Error('Your session has expired. Sign in again to save your profile.')
      if (file) {
        const body = new FormData()
        body.set('file', file)
        body.set('description', profile.avatarAlt.trim())
        uploadedUrl = (await avatarRequest('/api/profile/avatar', { method: 'POST', body })).avatarUrl
      }
      const requestedEmail = profile.email.trim()
      const emailChanged = requestedEmail !== (currentUser.email || '') && requestedEmail !== currentUser.pendingEmail
      const updated = await updateUser({
        ...(emailChanged ? { email: requestedEmail } : {}),
        data: { ...currentUser.userMetadata, full_name: profile.username.trim(), phone: profile.phone.trim(), bio: profile.bio.trim(), avatar_alt: profile.avatarAlt.trim(), ...(uploadedUrl ? { avatar_url: uploadedUrl } : {}) },
      })
      const oldAvatar = currentUser.pictureUrl
      const savedUpload = uploadedUrl
      uploadedUrl = ''
      if (savedUpload && oldAvatar && /^\/api\/profile\/avatar\/[\da-f-]{36}$/.test(oldAvatar)) {
        void avatarRequest(oldAvatar, { method: 'DELETE' }).catch(() => undefined)
      }
      onSaved(updated, updated.pendingEmail ? `Profile updated. Check your inbox to confirm the change to ${updated.pendingEmail}. Your current sign-in email stays active until confirmation.` : 'Profile updated successfully!')
    } catch (caught) {
      if (uploadedUrl) void avatarRequest(uploadedUrl, { method: 'DELETE' }).catch(() => undefined)
      setError(caught instanceof AuthError ? 'Unable to update your profile. Check your details and try again; the email may already be in use.' : caught instanceof Error ? caught.message : 'Unable to update your profile. Please try again.')
    } finally {
      submitLock.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  const avatarUrl = preview || user.pictureUrl
  return <form className="profile-form profile-settings" onSubmit={handleSubmit} aria-labelledby="profile-settings-title" aria-busy={busy}>
    <h3 id="profile-settings-title">Profile settings<span>.</span></h3>
    <p className="profile-hint">A little more you. Make this space your own.</p>
    <div className="profile-photo-row">
      <div className="profile-photo">{avatarUrl ? <img src={avatarUrl} alt={profile.avatarAlt || 'Your profile photo'} /> : <span aria-label="Your initials">{initials(profile.username)}</span>}</div>
      <div className="profile-photo-control"><label htmlFor="profile-avatar"><ImagePlus size={16} />Choose a photo</label><input id="profile-avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} disabled={busy} aria-describedby="profile-photo-help" /><p id="profile-photo-help">JPEG, PNG or WebP · up to 4 MB</p></div>
    </div>
    {(file || user.pictureUrl) && <div className="field"><label htmlFor="profile-avatar-alt">Photo description</label><input id="profile-avatar-alt" name="avatarAlt" value={profile.avatarAlt} onChange={handleChange} maxLength={200} required={Boolean(file)} disabled={busy} placeholder="Describe your photo for screen readers" /></div>}
    <div className="field"><label htmlFor="profile-username">Username <span className="profile-optional">display name, not a unique handle</span></label><input id="profile-username" name="username" value={profile.username} onChange={handleChange} minLength={2} maxLength={60} autoComplete="nickname" required disabled={busy} /></div>
    <div className="field"><label htmlFor="profile-email">Email</label><input id="profile-email" name="email" type="email" value={profile.email} onChange={handleChange} maxLength={254} autoComplete="email" required disabled={busy} aria-describedby="profile-email-help" /><p id="profile-email-help" className="profile-hint">Email changes require confirmation. Keep your current email until verified.</p></div>
    <div className="field"><label htmlFor="profile-phone">Phone number <span className="profile-optional">optional · private</span></label><input id="profile-phone" name="phone" type="tel" value={profile.phone} onChange={handleChange} maxLength={30} autoComplete="tel" disabled={busy} placeholder="+1 234 567 8900" /></div>
    <div className="field"><label htmlFor="profile-bio">Bio <span className="profile-optional">optional</span></label><textarea id="profile-bio" name="bio" value={profile.bio} onChange={handleChange} maxLength={500} rows={3} disabled={busy} placeholder="A few words about you…" /><p className="profile-hint">{profile.bio.length}/500 characters</p></div>
    {error && <div className="error-message" role="alert">{error}</div>}
    <div className="profile-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}<Check size={16} /></button></div>
  </form>
}
