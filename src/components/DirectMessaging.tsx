import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@netlify/identity'
import { ArrowDown, ArrowLeft, Check, LockKeyhole, MessageCircle, Plus, RefreshCw, Search, Send, UserRound, UsersRound } from 'lucide-react'
import { initials } from '@/lib/social'
import { messageCursor, messagingRequest } from '@/lib/messaging'
import type { Conversation, DirectMessage, Member, MessagePage } from '@/lib/messaging'

type Panel = 'chats' | 'members' | 'following'
type InboxPage = { conversations: Conversation[]; nextCursor: string | null }
type DirectoryPage = { members: Member[]; nextCursor: string | null }

function mergeMessages(current: DirectMessage[], incoming: DirectMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) merged.set(message.id, message)
  return [...merged.values()].sort((first, second) => messageCursor(first) < messageCursor(second) ? -1 : messageCursor(first) > messageCursor(second) ? 1 : 0)
}

function timeLabel(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function errorMessage(failure: unknown) {
  return failure instanceof Error ? failure.message : 'Something went wrong. Please try again.'
}

export default function DirectMessaging({ user, onAccount, initialQuery = '' }: { user: User; onAccount: () => void; initialQuery?: string }) {
  const [panel, setPanel] = useState<Panel>(initialQuery ? 'members' : 'chats')
  const [ready, setReady] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [sessionRetry, setSessionRetry] = useState(0)
  const [inbox, setInbox] = useState<InboxPage>({ conversations: [], nextCursor: null })
  const [inboxLoading, setInboxLoading] = useState(true)
  const [inboxMore, setInboxMore] = useState(false)
  const [inboxError, setInboxError] = useState('')
  const [inboxRefresh, setInboxRefresh] = useState(0)
  const [directory, setDirectory] = useState<DirectoryPage>({ members: [], nextCursor: null })
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [directoryMore, setDirectoryMore] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [directoryRefresh, setDirectoryRefresh] = useState(0)
  const [query, setQuery] = useState(initialQuery)
  const [acting, setActing] = useState(false)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [loadedThread, setLoadedThread] = useState('')
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [olderLoading, setOlderLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [threadRefresh, setThreadRefresh] = useState(0)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const actionLock = useRef(false)
  const sendLock = useRef(false)
  const inboxMoreLock = useRef(false)
  const directoryMoreLock = useRef(false)
  const olderLock = useRef(false)
  const listVersion = useRef(0)
  const inboxVersion = useRef(0)
  const selectedId = useRef('')
  const messageList = useRef<DirectMessage[]>([])
  const scrollArea = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLInputElement>(null)
  const autoScroll = useRef(true)
  const historyScroll = useRef<{ height: number; top: number } | null>(null)
  const sendAttempt = useRef<{ conversationId: string; content: string; clientId: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setSessionError('')
    messagingRequest('/session', { method: 'POST', signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) setReady(true)
    }).catch((failure) => { if (!controller.signal.aborted) setSessionError(errorMessage(failure)) })
    return () => controller.abort()
  }, [user.id, sessionRetry])

  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    const version = ++inboxVersion.current
    setInboxLoading(true)
    setInboxError('')
    let timer: ReturnType<typeof setTimeout> | undefined
    function scheduleRefresh() {
      timer = setTimeout(() => {
        if (controller.signal.aborted) return
        if (document.visibilityState === 'visible') void refresh()
        else scheduleRefresh()
      }, 10_000)
    }
    async function refresh(initial = false) {
      try {
        const page = await messagingRequest<InboxPage>('/conversations', { signal: controller.signal })
        if (controller.signal.aborted) return
        setInbox((current) => {
          const incomingIds = new Set(page.conversations.map((thread) => thread.id))
          const preserved = initial || !page.nextCursor ? [] : current.conversations.filter((thread) => !incomingIds.has(thread.id))
          return { conversations: [...page.conversations, ...preserved], nextCursor: preserved.length ? current.nextCursor : page.nextCursor }
        })
        setSelected((current) => current ? page.conversations.find((thread) => thread.id === current.id) || current : null)
        setInboxError('')
      } catch (failure) { if (!controller.signal.aborted) setInboxError(errorMessage(failure)) }
      finally {
        if (!controller.signal.aborted) {
          if (version === inboxVersion.current) setInboxLoading(false)
          scheduleRefresh()
        }
      }
    }
    void refresh(true)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [ready, inboxRefresh])

  useEffect(() => {
    const version = ++listVersion.current
    if (!ready || panel === 'chats') return
    const controller = new AbortController()
    setDirectoryLoading(true)
    setDirectoryError('')
    setDirectory({ members: [], nextCursor: null })
    const timer = setTimeout(() => {
      const parameters = new URLSearchParams({ q: query.trim(), following: String(panel === 'following') })
      messagingRequest<DirectoryPage>(`/members?${parameters}`, { signal: controller.signal }).then((page) => {
        if (!controller.signal.aborted && version === listVersion.current) setDirectory(page)
      }).catch((failure) => { if (!controller.signal.aborted) setDirectoryError(errorMessage(failure)) })
        .finally(() => { if (!controller.signal.aborted) setDirectoryLoading(false) })
    }, 250)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [ready, panel, query, directoryRefresh])

  useEffect(() => {
    if (!selected) { selectedId.current = ''; return }
    const controller = new AbortController()
    const threadId = selected.id
    selectedId.current = threadId
    messageList.current = []
    setMessages([])
    setLoadedThread('')
    setThreadLoading(true)
    setThreadError('')
    setOlderCursor(null)
    autoScroll.current = true
    historyScroll.current = null
    let timer: ReturnType<typeof setTimeout> | undefined
    function scheduleRefresh() {
      timer = setTimeout(() => {
        if (controller.signal.aborted) return
        if (document.visibilityState === 'visible') void refresh()
        else scheduleRefresh()
      }, 8_000)
    }
    async function refresh(initial = false) {
      try {
        const snapshot = messageList.current
        const lastSeen = snapshot.at(-1)
        let page = await messagingRequest<MessagePage>(`/conversations/${threadId}/messages`, { signal: controller.signal })
        const firstPageCursor = page.nextCursor
        let incoming = page.messages
        while (!initial && lastSeen && page.nextCursor && page.messages.length && messageCursor(page.messages[0]) > messageCursor(lastSeen)) {
          page = await messagingRequest<MessagePage>(`/conversations/${threadId}/messages?before=${encodeURIComponent(page.nextCursor)}`, { signal: controller.signal })
          incoming = [...page.messages, ...incoming]
        }
        if (controller.signal.aborted || selectedId.current !== threadId) return
        const area = scrollArea.current
        autoScroll.current = initial || !area || area.scrollHeight - area.scrollTop - area.clientHeight < 80
        if (initial || !snapshot.length) setOlderCursor(firstPageCursor)
        setMessages((current) => mergeMessages(initial ? [] : current, incoming))
        setLoadedThread(threadId)
        setThreadError('')
      } catch (failure) { if (!controller.signal.aborted) setThreadError(errorMessage(failure)) }
      finally {
        if (!controller.signal.aborted) {
          setThreadLoading(false)
          scheduleRefresh()
        }
      }
    }
    void refresh(true)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [selected?.id, threadRefresh])

  useEffect(() => {
    messageList.current = messages
    const area = scrollArea.current
    if (!area) return
    if (historyScroll.current) {
      area.scrollTop = historyScroll.current.top + area.scrollHeight - historyScroll.current.height
      historyScroll.current = null
    } else if (autoScroll.current) area.scrollTop = area.scrollHeight
  }, [messages])

  function chooseConversation(thread: Conversation) {
    if (sendLock.current || actionLock.current) return
    setSelected(thread)
    setInput('')
    setSendError('')
    sendAttempt.current = null
  }

  async function startConversation(member: Member) {
    if (actionLock.current || sendLock.current) return
    actionLock.current = true
    setActing(true)
    setDirectoryError('')
    try {
      const thread = await messagingRequest<Conversation>('/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId: member.id }) })
      setSelected(thread)
      setInput('')
      setSendError('')
      sendAttempt.current = null
      setInbox((current) => ({ ...current, conversations: [thread, ...current.conversations.filter((item) => item.id !== thread.id)] }))
    } catch (failure) { setDirectoryError(errorMessage(failure)) }
    finally { actionLock.current = false; setActing(false) }
  }

  async function toggleFollow(member: Member) {
    if (actionLock.current || sendLock.current) return
    actionLock.current = true
    setActing(true)
    setDirectoryError('')
    try {
      const result = await messagingRequest<{ active: boolean }>(`/members/${encodeURIComponent(member.id)}/follow`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !member.following }) })
      setDirectory((current) => ({ ...current, members: current.members.map((item) => item.id === member.id ? { ...item, following: result.active } : item).filter((item) => panel !== 'following' || item.following) }))
    } catch (failure) { setDirectoryError(errorMessage(failure)) }
    finally { actionLock.current = false; setActing(false) }
  }

  async function loadMoreList() {
    const isInbox = panel === 'chats'
    const lock = isInbox ? inboxMoreLock : directoryMoreLock
    const cursor = isInbox ? inbox.nextCursor : directory.nextCursor
    if (!cursor || lock.current) return
    lock.current = true
    const version = isInbox ? inboxVersion.current : listVersion.current
    if (isInbox) setInboxMore(true)
    else setDirectoryMore(true)
    try {
      if (isInbox) {
        const page = await messagingRequest<InboxPage>(`/conversations?cursor=${encodeURIComponent(cursor)}`)
        if (version === inboxVersion.current) setInbox((current) => ({ ...page, conversations: [...current.conversations, ...page.conversations.filter((thread) => !current.conversations.some((item) => item.id === thread.id))] }))
      } else {
        const parameters = new URLSearchParams({ q: query.trim(), following: String(panel === 'following'), cursor })
        const page = await messagingRequest<DirectoryPage>(`/members?${parameters}`)
        if (version === listVersion.current) setDirectory((current) => ({ ...page, members: [...current.members, ...page.members.filter((member) => !current.members.some((item) => item.id === member.id))] }))
      }
    } catch (failure) {
      if (isInbox && version === inboxVersion.current) setInboxError(errorMessage(failure))
      if (!isInbox && version === listVersion.current) setDirectoryError(errorMessage(failure))
    } finally {
      lock.current = false
      if (isInbox) setInboxMore(false)
      else setDirectoryMore(false)
    }
  }

  async function loadOlder() {
    if (!selected || !olderCursor || olderLock.current) return
    const threadId = selected.id
    olderLock.current = true
    setOlderLoading(true)
    setThreadError('')
    try {
      const page = await messagingRequest<MessagePage>(`/conversations/${threadId}/messages?before=${encodeURIComponent(olderCursor)}`)
      if (selectedId.current !== threadId) return
      const area = scrollArea.current
      if (area) historyScroll.current = { height: area.scrollHeight, top: area.scrollTop }
      autoScroll.current = false
      setMessages((current) => mergeMessages(current, page.messages))
      setOlderCursor(page.nextCursor)
    } catch (failure) { if (selectedId.current === threadId) setThreadError(errorMessage(failure)) }
    finally { olderLock.current = false; setOlderLoading(false) }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || sendLock.current || !input.trim() || threadLoading || loadedThread !== selected.id) return
    const content = input.trim()
    const conversationId = selected.id
    sendLock.current = true
    setSending(true)
    setSendError('')
    const previousAttempt = sendAttempt.current
    const clientId = previousAttempt?.conversationId === conversationId && previousAttempt.content === content ? previousAttempt.clientId : crypto.randomUUID()
    sendAttempt.current = { conversationId, content, clientId }
    try {
      const added = await messagingRequest<DirectMessage>(`/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, clientId }) })
      autoScroll.current = true
      setMessages((current) => mergeMessages(current, [added]))
      setInput('')
      sendAttempt.current = null
      setInboxRefresh((current) => current + 1)
      composer.current?.focus()
    } catch (failure) { setSendError(errorMessage(failure)) }
    finally { sendLock.current = false; setSending(false) }
  }

  const listLoading = panel === 'chats' ? inboxLoading : directoryLoading
  const listError = panel === 'chats' ? inboxError : directoryError
  const listEmpty = panel === 'chats' ? !inbox.conversations.length : !directory.members.length
  const listCursor = panel === 'chats' ? inbox.nextCursor : directory.nextCursor
  const threadReady = selected && loadedThread === selected.id

  return <section className="direct-messaging" aria-labelledby="messages-title">
    <header className="feed-header"><div><span className="eyebrow"><span /> A LITTLE CLOSER</span><h1 id="messages-title">Just between you.</h1><p>Find your people. Keep the conversation going.</p></div><button className="icon-button mobile-account" onClick={onAccount} disabled={sending} aria-label="Open account settings"><UserRound size={22} /></button></header>
    <p className="dm-privacy"><LockKeyhole size={13} />Private to the two members · not end-to-end encrypted</p>
    {sessionError && <div className="dm-feedback"><p className="social-error" role="alert">{sessionError}</p><button className="text-button" onClick={() => setSessionRetry((current) => current + 1)}>Retry connecting</button></div>}
    <div className={`dm-workspace ${selected ? 'dm-thread-selected' : ''}`}>
      <aside className="dm-sidebar" aria-label="Chats and member directory">
        <div className="dm-panel-switch" aria-label="Choose a message list">{(['chats', 'members', 'following'] as const).map((item) => <button key={item} className={panel === item ? 'active' : ''} aria-pressed={panel === item} disabled={acting || sending} onClick={() => { setPanel(item); setQuery('') }}>{item === 'chats' ? 'Chats' : item === 'members' ? 'Members' : 'Following'}</button>)}</div>
        {panel !== 'chats' && <div className="dm-search"><Search size={15} /><label className="sr-only" htmlFor="dm-member-search">Search {panel === 'following' ? 'followed members' : 'members'} by display name</label><input id="dm-member-search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Find a name…" disabled={acting || sending} /></div>}
        <div className="dm-list-heading"><h2>{panel === 'chats' ? 'Your conversations' : panel === 'members' ? 'Meet the community' : 'People you follow'}</h2><button className="icon-button" aria-label="Refresh list" disabled={!ready || acting || sending || listLoading} onClick={() => panel === 'chats' ? setInboxRefresh((current) => current + 1) : setDirectoryRefresh((current) => current + 1)}><RefreshCw size={14} /></button></div>
        <div className="dm-list">
          {(!ready || listLoading) && !sessionError && <div className="dm-list-skeleton" role="status"><span className="sr-only">Loading {panel === 'chats' ? 'conversations' : 'members'}…</span>{[0, 1, 2].map((item) => <div key={item} className="skeleton" />)}</div>}
          {listError && <div className="dm-feedback"><p className="social-error" role="alert">{listError}</p><button className="text-button" onClick={() => panel === 'chats' ? setInboxRefresh((current) => current + 1) : setDirectoryRefresh((current) => current + 1)}>Try again</button></div>}
          {ready && !listLoading && !listError && listEmpty && <div className="dm-list-empty"><UsersRound size={25} /><h3>{panel === 'chats' ? 'A hello starts it.' : panel === 'following' ? 'Your people, right here.' : 'No names found.'}</h3><p>{panel === 'chats' ? 'Find a member to start your first conversation.' : panel === 'following' ? query ? 'Try another name.' : 'Follow someone in Members to find them here.' : query ? 'Try a different name.' : 'Other members appear when they next open Buzzly.'}</p>{panel !== 'members' && <button className="text-button" onClick={() => { setPanel('members'); setQuery('') }}>Explore members<ArrowDown size={13} /></button>}</div>}
          {panel === 'chats' ? inbox.conversations.map((thread) => <button key={thread.id} className={`dm-conversation ${selected?.id === thread.id ? 'selected' : ''}`} onClick={() => chooseConversation(thread)} aria-pressed={selected?.id === thread.id} disabled={acting || sending}><span className="social-avatar">{initials(thread.peer.name)}</span><span><strong>{thread.peer.name}</strong><time dateTime={thread.updatedAt}>{timeLabel(thread.updatedAt)}</time></span><MessageCircle size={15} /></button>) : directory.members.map((member) => <div className="dm-member" key={member.id}><div><span className="social-avatar">{initials(member.name)}</span><strong>{member.name}</strong></div><div className="dm-member-actions"><button className={member.following ? 'following' : ''} disabled={acting || sending} onClick={() => void toggleFollow(member)} aria-label={`${member.following ? 'Unfollow' : 'Follow'} ${member.name}`} aria-pressed={member.following}>{member.following ? <Check size={13} /> : <Plus size={13} />}{member.following ? 'Following' : 'Follow'}</button><button disabled={acting || sending} onClick={() => void startConversation(member)} aria-label={`Message ${member.name}`}><Send size={13} />Message</button></div></div>)}
          {listCursor && <button className="dm-more text-button" disabled={inboxMore || directoryMore || listLoading || acting || sending} onClick={() => void loadMoreList()}>{inboxMore || directoryMore ? 'Loading…' : 'Show more'}</button>}
        </div>
        {panel !== 'chats' && <p className="dm-directory-note">Display names only. Emails and phone numbers stay private. Members appear after opening Buzzly.</p>}
      </aside>
      <section className="dm-thread" aria-label={selected ? `Conversation with ${selected.peer.name}` : 'Choose a conversation'}>
        {selected ? <>
          <header className="dm-thread-header"><button className="icon-button dm-back" aria-label="Back to conversations and members" disabled={sending} onClick={() => { selectedId.current = ''; setSelected(null); setInput(''); setSendError('') }}><ArrowLeft size={18} /></button><span className="social-avatar">{initials(selected.peer.name)}</span><div><h2>{selected.peer.name}</h2><span><LockKeyhole size={10} />Only the two of you</span></div><button className="icon-button" aria-label="Refresh conversation" disabled={threadLoading || sending || olderLoading} onClick={() => setThreadRefresh((current) => current + 1)}><RefreshCw size={16} /></button></header>
          <div className="dm-message-list" ref={scrollArea} role="region" aria-label="Message history" tabIndex={0}>
            {threadLoading && <p role="status" className="social-muted">Loading your conversation…</p>}
            {threadError && <div className="dm-feedback"><p className="social-error" role="alert">{threadError}</p><button className="text-button" onClick={() => setThreadRefresh((current) => current + 1)}>Retry loading messages</button></div>}
            {threadReady && olderCursor && <button className="dm-more text-button" disabled={olderLoading || threadLoading} onClick={() => void loadOlder()}>{olderLoading ? 'Loading…' : 'Earlier messages'}</button>}
            {threadReady && !messages.length && <div className="dm-thread-empty"><MessageCircle size={28} /><h3>Every connection starts somewhere.</h3><p>Say hello to {selected.peer.name}. No sample messages, just your conversation.</p></div>}
            {threadReady && messages.map((message) => <article key={message.id} className={`dm-message ${message.senderId === user.id ? 'outgoing' : ''}`}><span className="dm-sender">{message.senderId === user.id ? 'You' : selected.peer.name}</span><p>{message.content}</p><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></article>)}
          </div>
          <span className="sr-only" role="status">{threadReady ? `${messages.length} messages loaded in this conversation.` : ''}</span>
          <form className="dm-composer" onSubmit={handleSend} aria-busy={sending}><label className="sr-only" htmlFor="dm-message-input">Message to {selected.peer.name}</label><div><input id="dm-message-input" ref={composer} value={input} onChange={(event) => { setInput(event.target.value); setSendError('') }} maxLength={2000} placeholder="A little hello…" required disabled={sending || !threadReady || threadLoading} /><button type="submit" disabled={sending || !threadReady || threadLoading || !input.trim()} aria-label={sending ? 'Sending message' : 'Send message'}><Send size={18} /></button></div><p>{sending ? 'Sending…' : 'Enter to send'}<span>{input.length}/2,000</span></p>{sendError && <p className="social-error" role="alert">{sendError}</p>}</form>
        </> : <div className="dm-welcome"><span className="dm-welcome-icon"><MessageCircle size={34} strokeWidth={1.3} /></span><span className="eyebrow">LESS NOISE. MORE CONNECTION.</span><h2>A quieter corner<br />of your world<span>.</span></h2><p>Pick a conversation, find a familiar name, or say hello to someone new.</p><button className="text-button" disabled={!ready} onClick={() => { setPanel('members'); setQuery('') }}>Find your people<UsersRound size={15} /></button></div>}
      </section>
    </div>
    <p className="dm-footer">Conversations refresh automatically while this page is open.</p>
  </section>
}
