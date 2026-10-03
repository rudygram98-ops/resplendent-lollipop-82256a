import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BellOff, Check, Clock3, LockKeyhole, MessageCircle, RefreshCw, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { browserTimeZone, minutesToTime, parseHiddenWords, settingsRequest, timeToMinutes } from '@/lib/settings'
import type { MemberSettings, MessagePolicy, SettingsResponse } from '@/lib/settings'

type Tab = 'privacy' | 'content' | 'interactions' | 'wellbeing'

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'privacy', label: 'Privacy & audience', icon: ShieldCheck },
  { id: 'content', label: 'Content & moderation', icon: Sparkles },
  { id: 'interactions', label: 'Interactions & messages', icon: MessageCircle },
  { id: 'wellbeing', label: 'Digital wellbeing', icon: Clock3 },
]

type ToggleKey = 'isPrivate' | 'reviewTags' | 'allowRemixes' | 'allowDownloads' | 'quietMode'

function Toggle({ id, title, description, checked, disabled, onChange }: { id: string; title: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <div className="setting-card">
    <div><label htmlFor={id}>{title}</label><p id={`${id}-help`}>{description}</p></div>
    <input id={id} type="checkbox" role="switch" className="setting-switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-describedby={`${id}-help`} />
  </div>
}

function SoonToggle({ id, title, description }: { id: string; title: string; description: string }) {
  return <div className="setting-card is-soon">
    <div><label htmlFor={id}>{title}<span className="soon-badge">Coming soon</span></label><p id={`${id}-help`}>{description}</p></div>
    <input id={id} type="checkbox" role="switch" className="setting-switch" disabled aria-describedby={`${id}-help`} />
  </div>
}

export default function AppSettings({ onAccount, onSaved }: { onAccount: () => void; onSaved: (settings: MemberSettings) => void }) {
  const [tab, setTab] = useState<Tab>('privacy')
  const [saved, setSaved] = useState<SettingsResponse | null>(null)
  const [messagePolicy, setMessagePolicy] = useState<MessagePolicy>('everyone')
  const [hiddenWords, setHiddenWords] = useState('')
  const [screenTime, setScreenTime] = useState(0)
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({ isPrivate: false, reviewTags: false, allowRemixes: true, allowDownloads: true, quietMode: false })
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('07:00')
  const [timeZone, setTimeZone] = useState('UTC')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const saveLock = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    setTimeZone(browserTimeZone())
    settingsRequest({ signal: controller.signal }).then(apply).catch((failure) => { if (!controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : 'Settings could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])

  function apply(settings: SettingsResponse) {
    setSaved(settings)
    setMessagePolicy(settings.messagePolicy)
    setHiddenWords(settings.hiddenWords.join(', '))
    setScreenTime(settings.screenTimeMinutes)
    setToggles({ isPrivate: settings.isPrivate, reviewTags: settings.reviewTags, allowRemixes: settings.allowRemixes, allowDownloads: settings.allowDownloads, quietMode: settings.quietMode })
    setQuietStart(minutesToTime(settings.quietStart))
    setQuietEnd(minutesToTime(settings.quietEnd))
  }

  function change<Value>(setter: (value: Value) => void) {
    return (value: Value) => { setter(value); setNotice(''); setError('') }
  }

  const setToggle = (key: ToggleKey) => change((checked: boolean) => setToggles((current) => ({ ...current, [key]: checked })))
  const words = parseHiddenWords(hiddenWords)
  const startMinutes = timeToMinutes(quietStart)
  const endMinutes = timeToMinutes(quietEnd)
  const dirty = Boolean(saved) && (messagePolicy !== saved?.messagePolicy || screenTime !== saved?.screenTimeMinutes || words.join(',') !== saved?.hiddenWords.join(',')
    || (Object.keys(toggles) as ToggleKey[]).some((key) => toggles[key] !== saved?.[key])
    || startMinutes !== saved?.quietStart || endMinutes !== saved?.quietEnd || (toggles.quietMode && timeZone !== saved?.timeZone))

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveLock.current || !saved) return
    setNotice('')
    if (words.length > 50) { setError('Use up to 50 hidden words or phrases.'); setTab('content'); return }
    if (words.some((word) => word.length > 40)) { setError('Keep each hidden word or phrase to 40 characters or fewer.'); setTab('content'); return }
    if (startMinutes === null || endMinutes === null) { setError('Choose a start and end time for quiet mode.'); setTab('wellbeing'); return }
    if (toggles.quietMode && startMinutes === endMinutes) { setError('Quiet mode needs different start and end times.'); setTab('wellbeing'); return }
    saveLock.current = true
    setSaving(true)
    setError('')
    try {
      const updated = await settingsRequest({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messagePolicy, hiddenWords: words, screenTimeMinutes: screenTime, ...toggles, quietStart: startMinutes, quietEnd: endMinutes, timeZone }) })
      apply(updated)
      onSaved(updated)
      setNotice('Settings saved. They apply right away.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Your settings could not be saved. Please try again.') }
    finally { saveLock.current = false; setSaving(false) }
  }

  return <section className="app-settings" aria-labelledby="settings-title">
    <header className="feed-header"><div><span className="eyebrow"><span /> YOUR SPACE, YOUR RULES</span><h1 id="settings-title">Settings & privacy.</h1><p>Shape who reaches you, what you see, and how you spend your time.</p></div><button className="icon-button mobile-account" onClick={onAccount} aria-label="Open account settings"><UserRound size={22} /></button></header>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={tab === id ? 'active' : ''} aria-pressed={tab === id} aria-controls="settings-panel" onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}
      </nav>
      <form id="settings-panel" className="settings-panel" onSubmit={handleSave} aria-busy={loading || saving}>
        {loading && <div className="dm-list-skeleton" role="status"><span className="sr-only">Loading your settings…</span><div className="skeleton" /><div className="skeleton" /></div>}
        {loadError && <div className="dm-feedback"><p className="social-error" role="alert">{loadError}</p><button type="button" className="text-button" onClick={() => setRetry((current) => current + 1)}>Try again<RefreshCw size={13} /></button></div>}
        {saved && !loading && <>
          {tab === 'privacy' && <fieldset>
            <legend>Privacy & audience</legend>
            <div className="setting-card">
              <div><strong>Find me by email or phone</strong><p>Members can never look you up by email or phone number. The directory shows display names only.</p></div>
              <span className="always-badge"><LockKeyhole size={12} />Always private</span>
            </div>
            <Toggle id="setting-private" title="Private account" description={toggles.isPrivate ? 'Only followers you approve can see your posts and media. New follows arrive as requests in Notifications.' : 'Anyone signed in can see your posts. Turning private on keeps current followers; turning it off approves any pending requests.'} checked={toggles.isPrivate} disabled={saving} onChange={setToggle('isPrivate')} />
            {saved.isPrivate && saved.pendingRequests > 0 && <p className="setting-note">{saved.pendingRequests === 1 ? '1 follow request is' : `${saved.pendingRequests} follow requests are`} waiting for you in Notifications.</p>}
            <Toggle id="setting-tags" title="Review tagged posts" description="New posts you’re tagged in stay off your Tagged posts and don’t show your name until you approve them." checked={toggles.reviewTags} disabled={saving} onChange={setToggle('reviewTags')} />
            <SoonToggle id="setting-close-friends" title="Close friends audience" description="Share selected posts with a smaller list of people." />
          </fieldset>}

          {tab === 'content' && <fieldset>
            <legend>Content & moderation</legend>
            <div className="setting-group">
              <label htmlFor="setting-hidden-words">Hidden words</label>
              <p id="setting-hidden-words-help">Comments and messages from others that contain these words or phrases are hidden from you. Separate entries with commas · up to 50.</p>
              <textarea id="setting-hidden-words" value={hiddenWords} onChange={(event) => { setHiddenWords(event.target.value); setNotice(''); setError('') }} rows={3} maxLength={2500} placeholder="spam, fake, promo" disabled={saving} aria-describedby="setting-hidden-words-help" />
              <small>{words.length}/50 · your own comments and messages are never hidden</small>
            </div>
            <div className="setting-group is-soon">
              <label htmlFor="setting-sensitive">Sensitive content<span className="soon-badge">Coming soon</span></label>
              <p id="setting-sensitive-help">Choose how much sensitive media appears in your feed and search.</p>
              <select id="setting-sensitive" disabled defaultValue="standard" aria-describedby="setting-sensitive-help"><option value="allow">More</option><option value="standard">Standard</option><option value="limit">Less</option></select>
            </div>
          </fieldset>}

          {tab === 'interactions' && <fieldset>
            <legend>Interactions & messages</legend>
            <div className="setting-group">
              <label htmlFor="setting-messages">Who can message you</label>
              <p id="setting-messages-help">Applies to new conversations and to new messages in existing ones. You can still message members who accept messages from you.</p>
              <select id="setting-messages" value={messagePolicy} onChange={(event) => { setMessagePolicy(event.target.value as MessagePolicy); setNotice(''); setError('') }} disabled={saving} aria-describedby="setting-messages-help">
                <option value="everyone">Everyone on Buzzly</option>
                <option value="following">Only people I follow</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
            <Toggle id="setting-remix" title="Allow remixes" description="Let others feature your posts in their own responses. Existing remixes stay up." checked={toggles.allowRemixes} disabled={saving} onChange={setToggle('allowRemixes')} />
            <Toggle id="setting-downloads" title="Allow media downloads" description="Offer viewers a download button for your photos and clips. Turning this off removes the button but can’t stop screenshots." checked={toggles.allowDownloads} disabled={saving} onChange={setToggle('allowDownloads')} />
          </fieldset>}

          {tab === 'wellbeing' && <fieldset>
            <legend>Digital wellbeing</legend>
            <div className="setting-group">
              <label htmlFor="setting-screen-time">Daily time reminder</label>
              <p id="setting-screen-time-help">Shows a gentle reminder once you’ve spent this long in Buzzly today on this device.</p>
              <select id="setting-screen-time" value={screenTime} onChange={(event) => { setScreenTime(Number(event.target.value)); setNotice(''); setError('') }} disabled={saving} aria-describedby="setting-screen-time-help">
                <option value={0}>Off</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
            <Toggle id="setting-quiet" title="Quiet mode" description="Hold back notification alerts during your quiet hours. Notifications still collect in your list and appear once quiet hours end. Buzzly only sends in-app notifications, never email." checked={toggles.quietMode} disabled={saving} onChange={setToggle('quietMode')} />
            {toggles.quietMode && <div className="setting-group quiet-hours">
              <div><label htmlFor="setting-quiet-start">Quiet from</label><input id="setting-quiet-start" type="time" value={quietStart} onChange={(event) => change(setQuietStart)(event.target.value)} disabled={saving} required /></div>
              <div><label htmlFor="setting-quiet-end">Until</label><input id="setting-quiet-end" type="time" value={quietEnd} onChange={(event) => change(setQuietEnd)(event.target.value)} disabled={saving} required /></div>
              <small>Times use your time zone: {timeZone}{saved.quietNow && saved.quietMode ? ' · quiet hours are on right now' : ''}</small>
            </div>}
            {saved.quietNow && saved.quietMode && <p className="setting-note"><BellOff size={13} />Alerts are paused until {minutesToTime(saved.quietEnd)}.</p>}
          </fieldset>}

          {error && <p className="social-error" role="alert">{error}</p>}
          <p className="social-notice" role="status">{notice && <><Check size={14} />{notice}</>}</p>
          <button type="submit" className="primary-button" disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save settings' : 'All changes saved'}<Check size={16} /></button>
        </>}
      </form>
    </div>
  </section>
}
