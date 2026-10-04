import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2,
  Eye, EyeOff, Film, Heart, ImagePlus, LockKeyhole, LogOut, Mail, MessageCircle,
  ShieldCheck, Sparkles, UserRound, UsersRound, X, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { authErrorMessage, getUser, login, logout, signup } from '@/lib/auth'
import type { User } from '@/lib/auth'
import { clearLocalDrafts, readLocal, writeLocal } from '@/lib/storage'
import SocialFeed from '@/components/SocialFeed'
import ProfileSettings from '@/components/ProfileSettings'
import ThemeToggle from '@/components/ThemeToggle'

type AuthMode = 'login' | 'signup'
type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>

function Brand() {
  return <a className="brand" href="/" aria-label="Buzzly home"><span className="brand-icon"><Zap size={24} fill="currentColor" strokeWidth={1.8} /></span><span>buzzly<span className="brand-dot">.</span></span></a>
}

function CommunityPreview() {
  return <div className="community-preview" aria-label="Illustrative preview of the Buzzly community">
    <div className="orbit orbit-one" /><div className="orbit orbit-two" />
    <div className="floating-spark"><Sparkles size={29} strokeWidth={1.4} /></div>
    <article className="moment-card">
      <div className="moment-author"><span className="avatar avatar-peach">AJ</span><div><strong>Alex Jules</strong><span>A little moment worth sharing</span></div><span className="sample-badge">PREVIEW</span></div>
      <img className="moment-image" src="/.netlify/images?url=/images/scenic-moment.jpg&w=640&h=340&fit=cover&fm=webp" alt="A quiet lake reflecting mountains at sunset" width="640" height="340" decoding="async" />
      <div className="moment-content"><p>Taking the scenic route. Always.</p><div><span><Heart size={16} /> Little things, big feelings</span><MessageCircle size={17} /></div></div>
    </article>
    <div className="connection-card"><div className="connection-icon"><UsersRound size={21} /></div><div><strong>Your kind of people.</strong><span>Just a conversation away.</span></div><span className="connection-dot" /></div>
    <div className="small-note"><ArrowDownLeft size={22} strokeWidth={1.5} /><span>Less noise. More real.</span></div>
    <div className="floating-heart"><Heart size={23} fill="currentColor" /></div>
  </div>
}

function Field({ label, name, value, onChange, icon: Icon, type = 'text', placeholder, error, autoComplete, disabled, minLength, maxLength }: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  icon: LucideIcon
  type?: string
  placeholder: string
  error?: string
  autoComplete?: string
  disabled?: boolean
  minLength?: number
  maxLength?: number
}) {
  const [visible, setVisible] = useState(false)
  const password = type === 'password'
  return <div className="field">
    <label htmlFor={name}>{label}</label>
    <div className={`input-wrap ${error ? 'invalid' : ''}`}><Icon size={18} strokeWidth={1.7} /><input id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} type={password && visible ? 'text' : type} placeholder={placeholder} autoComplete={autoComplete} disabled={disabled} required minLength={minLength} maxLength={maxLength} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} />{password && <button type="button" className="visibility-button" onClick={() => setVisible(!visible)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} disabled={disabled}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>}</div>
    {error && <p className="field-error" id={`${name}-error`}>{error}</p>}
  </div>
}

export function Buzzly() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const helpDialog = useRef<HTMLDialogElement>(null)
  const submitLock = useRef(false)

  useEffect(() => {
    let active = true
    setEmail((current) => current || readLocal('email'))
    getUser()
      .then((currentUser) => { if (active) setUser(currentUser) })
      .catch(() => { if (active) setError('We couldn’t restore your session. Please sign in again.') })
      .finally(() => { if (active) setInitializing(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (helpOpen) helpDialog.current?.showModal()
    else helpDialog.current?.close()
  }, [helpOpen])

  function switchMode(next: AuthMode) {
    if (busy || initializing) return
    setMode(next)
    setError('')
    setNotice('')
    setFieldErrors({})
    setPassword('')
    setConfirm('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current || initializing) return
    const errors: FieldErrors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
    if (mode === 'signup' && name.trim().length < 2) errors.name = 'Use at least 2 characters for your name.'
    if (!password) errors.password = 'Enter your password.'
    else if (mode === 'signup' && password.length < 8) errors.password = 'Use at least 8 characters.'
    if (mode === 'signup' && password !== confirm) errors.confirm = 'Your passwords don’t match.'
    setFieldErrors(errors)
    setError('')
    setNotice('')
    if (Object.keys(errors).length) return
    submitLock.current = true
    setBusy(true)
    try {
      setUser(mode === 'login' ? await login(email.trim(), password) : await signup(name.trim(), email.trim(), password))
      writeLocal('email', email.trim())
      setPassword('')
      setConfirm('')
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
      submitLock.current = false
    }
  }

  async function handleLogout() {
    if (submitLock.current) return
    submitLock.current = true
    setBusy(true)
    setError('')
    try {
      await logout()
      clearLocalDrafts()
      setUser(null)
      setMode('login')
      setEditingName(false)
      setName('')
      setEmail(readLocal('email'))
      setNotice('You’re signed out. See you around!')
    } catch (caught) {
      setUser(await getUser().catch(() => null))
      setError(authErrorMessage(caught))
    } finally {
      submitLock.current = false
      setBusy(false)
    }
  }

  const signedIn = Boolean(user)
  if (!initializing && signedIn && user && !accountOpen) return <SocialFeed key={user.id} user={user} onAccount={() => setAccountOpen(true)} />
  const displayName = user?.name || 'friend'
  const title = mode === 'signup' ? 'Your people are out there.' : 'Welcome back.'
  const subtitle = mode === 'signup' ? 'Make yourself at home. Create your Buzzly account.' : 'Good to see you. Let’s get you back to the buzz.'

  return <div className="site-shell">
    <header className="site-header"><Brand /><span className="header-tagline">A little less noise. A lot more you.</span><div className="header-action"><ThemeToggle />{signedIn ? <span className="session-label"><span /> You’re in</span> : <><span>{mode === 'signup' ? 'Already part of the buzz?' : 'New around here?'}</span><button onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')} disabled={busy || initializing}>{mode === 'signup' ? 'Sign in' : 'Join the buzz'}<ArrowUpRight size={16} /></button></>}</div></header>
    <main className="main-grid">
      <section className="story-side">
        <div className="eyebrow"><span /> YOUR LITTLE CORNER OF THE INTERNET</div>
        <h1>Find your people.<br /><span>Feel the buzz.</span><Sparkles className="headline-spark" size={33} strokeWidth={1.3} /></h1>
        <p className="hero-description">Big ideas, small moments, and people who just get you.<br className="desktop-break" /> A space to share what makes you, you.</p>
        <CommunityPreview />
        <div className="feature-row"><span><MessageCircle size={16} /> Thoughts & conversations</span><span><ImagePlus size={16} /> Photo moments</span><span><Film size={16} /> Short clips</span></div>
      </section>
      <section className="auth-side" aria-label={signedIn ? 'Your account' : 'Sign in or create an account'}>
        <div className={`auth-card ${mode === 'signup' ? 'signup-card' : ''}`}>
          {initializing ? <div className="auth-loading" role="status" aria-live="polite"><div className="skeleton skeleton-tabs" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-input" /><div className="skeleton skeleton-input" /><div className="skeleton skeleton-button" /><p>Getting your space ready…</p></div> : signedIn ? <>
            <button className="back-button" disabled={busy} onClick={() => { setAccountOpen(false); setEditingName(false) }}><ArrowLeft size={16} />Back to the buzz</button>
            <div className="account-topline"><span className="account-label"><CheckCircle2 size={16} /> YOU’RE PART OF THE BUZZ</span><Sparkles size={22} /></div>
            <div className="account-avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt={user.avatarAlt || 'Your profile photo'} /> : displayName.slice(0, 2).toUpperCase()}</div><h2 className="account-heading">Hey, {displayName}<span>.</span></h2><p className="auth-description">Your corner of Buzzly is ready.</p>
            {notice && <div className="notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span></div>}
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="account-details"><div><span><Mail size={16} /> Email address</span><strong>{user?.email || 'Not provided'}</strong></div><div><span><UserRound size={16} /> Display name</span><strong>{displayName}</strong></div><div><span><ShieldCheck size={16} /> Account status</span><strong className="verified-status"><Check size={14} /> Signed in</strong></div></div>
            {editingName && user ? <ProfileSettings key={user.id} user={user} onBusyChange={setBusy} onCancel={() => setEditingName(false)} onSaved={(updated, message) => { setUser(updated); setEditingName(false); setNotice(message) }} /> : <button className="primary-button" disabled={busy} onClick={() => { setEditingName(true); setNotice(''); setError('') }}>Edit your profile<ArrowRight size={18} /></button>}
            <button className="signout-button" onClick={() => void handleLogout()} disabled={busy}><LogOut size={16} />{busy ? 'Please wait…' : 'Sign out'}</button>
          </> : <>
            <div className="auth-tabs" aria-label="Choose account action"><button className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => switchMode('login')} disabled={busy}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')} disabled={busy}>Create account</button></div>
            <div className="form-heading"><div className="form-icon"><Zap size={20} fill="currentColor" /></div><h2>{title}</h2><p className="auth-description">{subtitle}</p></div>
            {error && <div className="error-message" role="alert">{error}</div>}
            {notice && <div className="notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span></div>}
            <form onSubmit={handleSubmit} noValidate className="auth-form" aria-busy={busy}>
              <fieldset disabled={busy}>
                {mode === 'signup' && <Field label="Display name" name="name" icon={UserRound} value={name} onChange={setName} placeholder="What should we call you?" autoComplete="name" maxLength={60} error={fieldErrors.name} />}
                <Field label="Email address" name="email" icon={Mail} value={email} onChange={setEmail} type="email" placeholder="you@example.com" autoComplete="email" maxLength={254} error={fieldErrors.email} />
                <Field label="Password" name="password" icon={LockKeyhole} value={password} onChange={setPassword} type="password" placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={200} error={fieldErrors.password} />{mode === 'signup' && <Field label="Confirm password" name="confirm" icon={LockKeyhole} value={confirm} onChange={setConfirm} type="password" placeholder="One more time" autoComplete="new-password" maxLength={200} error={fieldErrors.confirm} />}
                <button type="submit" className="primary-button" disabled={busy}>{busy ? <><span className="button-spinner" />{mode === 'login' ? 'Signing you in…' : 'Creating your account…'}</> : <>{mode === 'signup' ? 'Create my account' : 'Sign in to Buzzly'}<ArrowRight size={18} /></>}</button>
              </fieldset>
            </form>
            {mode === 'login' && <p className="form-bottom">Not part of the buzz yet? <button className="text-button" disabled={busy} onClick={() => switchMode('signup')}>Create an account<ArrowUpRight size={13} /></button></p>}
            {mode === 'signup' && <p className="signup-note"><Mail size={14} />Create your account and you’re ready to go.</p>}
          </>}
          <div className="card-footnote"><ShieldCheck size={14} /><span>A secure little space for your authentic self.</span></div>
        </div>
        <div className="outside-card-note"><Sparkles className="tiny-star" size={13} /> No perfect profiles. Just real people.</div>
      </section>
    </main>
    <footer className="site-footer"><span>© 2026 Buzzly</span><span className="footer-middle">Made for connection, not comparison.</span><button onClick={() => setHelpOpen(true)}>Need a hand?<ArrowUpRight size={14} /></button></footer>
    <dialog ref={helpDialog} className="help-dialog" aria-labelledby="account-help-title" onClose={() => setHelpOpen(false)} onClick={(event) => { if (event.target === helpDialog.current) setHelpOpen(false) }}>
      <div className="help-content"><button className="dialog-close" aria-label="Close account help" onClick={() => setHelpOpen(false)}><X size={20} /></button><span className="form-icon"><MessageCircle size={21} /></span><h2 id="account-help-title">A little help with the buzz.</h2><h3>Creating an account</h3><p>Choose Create account, enter your name, email, and a password of at least 8 characters. You’re signed in right away.</p><h3>Can’t sign in?</h3><p>Check your email and password and try again. You can change your password anytime from Edit your profile while signed in.</p><h3>Coming from the original Buzzly site?</h3><p>This site uses new Buzzly accounts. Accounts from the original site aren’t connected here; create an account with your preferred email to get started.</p><h3>Your account stays yours</h3><p>Your password is stored only as a secure hash, never in plain text. Your session stays signed in on this device until you sign out. Always sign out on shared devices.</p><button className="primary-button" onClick={() => setHelpOpen(false)}>Got it<Check size={17} /></button></div>
    </dialog>
  </div>
}
