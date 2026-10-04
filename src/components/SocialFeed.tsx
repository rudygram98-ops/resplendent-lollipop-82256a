import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@/lib/auth'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronLeft, Film, Heart, Home,
  ImagePlus, MessageCircle, Plus, RefreshCw, Send, Settings, Share2, Sparkles,
  Trash2, UserRound, UsersRound, X, Zap,
} from 'lucide-react'
import { initials, socialRequest } from '@/lib/social'
import ThemeToggle from '@/components/ThemeToggle'
import { readLocal, writeLocal } from '@/lib/storage'
import type { FeedView, SocialComment, SocialPost } from '@/lib/social'
import DirectMessaging from '@/components/DirectMessaging'
import SearchBar from '@/components/SearchBar'
import { messagingRequest } from '@/lib/messaging'
import AppSettings from '@/components/AppSettings'
import { settingsRequest, useScreenTimeReminder } from '@/lib/settings'

type FeedPage = { posts: SocialPost[]; nextCursor: string | null }
type CommentPage = { comments: SocialComment[]; nextCursor: string | null }

function formatDate(date: string) {
  return new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function PostCard({ post, user, onChange, onDelete }: {
  post: SocialPost
  user: User
  onChange: (post: SocialPost) => void
  onDelete: (id: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentPage, setCommentPage] = useState<CommentPage | null>(null)
  const [comment, setComment] = useState('')
  const deleteDialog = useRef<HTMLDialogElement>(null)
  const actionLock = useRef(false)
  const own = post.authorId === user.id
  const name = own ? user.name || post.authorName : post.authorName

  async function toggle(action: 'like' | 'save') {
    if (actionLock.current) return
    actionLock.current = true
    setPending(true)
    setError('')
    try {
      const result = await socialRequest<{ active: boolean; likeCount: number }>(`/${post.id}/${action}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !(action === 'like' ? post.liked : post.saved) }),
      })
      onChange({ ...post, [action === 'like' ? 'liked' : 'saved']: result.active, likeCount: result.likeCount })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.') }
    finally { actionLock.current = false; setPending(false) }
  }

  async function loadComments(more = false) {
    if (commentLoading) return
    setCommentLoading(true)
    setError('')
    try {
      const page = await socialRequest<CommentPage>(`/${post.id}/comments${more && commentPage?.nextCursor ? `?before=${encodeURIComponent(commentPage.nextCursor)}` : ''}`)
      setCommentPage((previous) => ({ ...page, comments: more ? [...previous?.comments || [], ...page.comments] : page.comments }))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load comments.') }
    finally { setCommentLoading(false) }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (actionLock.current || !comment.trim()) return
    actionLock.current = true
    setPending(true)
    setError('')
    try {
      const added = await socialRequest<SocialComment>(`/${post.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: comment }) })
      setCommentPage((previous) => ({ comments: [added, ...previous?.comments || []], nextCursor: previous?.nextCursor || null }))
      setComment('')
      onChange({ ...post, commentCount: post.commentCount + 1 })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not add your comment.') }
    finally { actionLock.current = false; setPending(false) }
  }

  async function removePost() {
    if (actionLock.current) return
    actionLock.current = true
    setPending(true)
    setError('')
    try {
      await socialRequest(`/${post.id}`, { method: 'DELETE' })
      deleteDialog.current?.close()
      onDelete(post.id)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete your post.'); deleteDialog.current?.close() }
    finally { actionLock.current = false; setPending(false) }
  }

  async function share() {
    setError('')
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`)
      setNotice('Post link copied. Anyone with a Buzzly account can open it.')
    } catch { setError('Your browser could not copy the link. Try again with clipboard access enabled.') }
  }

  return <article className={`social-post ${post.mediaType?.startsWith('video/') ? 'video-post' : ''}`} id={`post-${post.id}`}>
    <header className="post-header">
      <span className="social-avatar" aria-hidden="true">{initials(name)}</span>
      <div><strong>{name}</strong><time dateTime={post.createdAt}>{formatDate(post.createdAt)}{own ? ' · You' : ''}</time></div>
      {own && <button className="icon-button post-delete" aria-label="Delete your post" onClick={() => deleteDialog.current?.showModal()} disabled={pending}><Trash2 size={17} /></button>}
    </header>
    {post.content && <p className="post-text">{post.content}</p>}
    {post.mediaType?.startsWith('image/') && <img className="post-media" src={`/api/social/${post.id}/media`} alt={post.mediaAlt || 'Community photo'} loading="lazy" decoding="async" />}
    {post.mediaType?.startsWith('video/') && <div className="post-video"><video controls playsInline preload="metadata" aria-label={post.mediaAlt || 'Community clip'} src={`/api/social/${post.id}/media`} /><p><Film size={14} />{post.mediaAlt}</p></div>}
    <div className="post-actions">
      <button aria-label={`${post.liked ? 'Unlike' : 'Like'} post, ${post.likeCount} likes`} aria-pressed={post.liked} className={post.liked ? 'is-active' : ''} disabled={pending} onClick={() => void toggle('like')}><Heart size={20} fill={post.liked ? 'currentColor' : 'none'} /><span>{post.likeCount}</span></button>
      <button aria-label={`${commentsOpen ? 'Hide' : 'Show'} comments, ${post.commentCount} comments`} aria-expanded={commentsOpen} aria-controls={`comments-${post.id}`} onClick={() => { setCommentsOpen(!commentsOpen); if (!commentsOpen && !commentPage) void loadComments() }}><MessageCircle size={20} /><span>{post.commentCount}</span></button>
      <button aria-label="Copy post link" onClick={() => void share()}><Share2 size={18} /></button>
      <button className={`save-action ${post.saved ? 'is-active' : ''}`} aria-label={post.saved ? 'Unsave post' : 'Save post'} aria-pressed={post.saved} disabled={pending} onClick={() => void toggle('save')}><Bookmark size={20} fill={post.saved ? 'currentColor' : 'none'} /></button>
    </div>
    {notice && <p className="social-notice" role="status">{notice}</p>}
    {error && <p className="social-error" role="alert">{error}</p>}
    {commentsOpen && <section className="post-comments" id={`comments-${post.id}`} aria-label="Comments">
      {commentLoading && <p role="status" className="social-muted">Loading the conversation…</p>}
      {!commentLoading && !commentPage && <button className="text-button" onClick={() => void loadComments()}>Retry loading comments</button>}
      {commentPage?.comments.map((item) => <div className="social-comment" key={item.id}><span className="social-avatar small" aria-hidden="true">{initials(item.authorName)}</span><div><strong>{item.authorId === user.id ? user.name || item.authorName : item.authorName}</strong><p>{item.content}</p><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div></div>)}
      {commentPage && !commentPage.comments.length && <p className="social-muted">Be the first to start a conversation.</p>}
      {commentPage?.nextCursor && <button className="text-button" disabled={commentLoading} onClick={() => void loadComments(true)}>More comments<ArrowDown size={14} /></button>}
      <form className="comment-form" onSubmit={addComment}><label className="sr-only" htmlFor={`comment-${post.id}`}>Your comment</label><input id={`comment-${post.id}`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="Add to the conversation…" required disabled={pending || commentLoading || !commentPage} /><button type="submit" className="icon-button" aria-label="Publish comment" disabled={pending || commentLoading || !commentPage || !comment.trim()}><Send size={18} /></button></form>
    </section>}
    <dialog className="social-dialog" ref={deleteDialog} aria-labelledby={`delete-title-${post.id}`}><h2 id={`delete-title-${post.id}`}>Delete this moment?</h2><p>Your post, media, likes, and comments are removed permanently.</p><div><button className="secondary-button" disabled={pending} onClick={() => deleteDialog.current?.close()}>Keep it</button><button className="primary-button" disabled={pending} onClick={() => void removePost()}>{pending ? 'Deleting…' : 'Delete post'}</button></div></dialog>
  </article>
}

export default function SocialFeed({ user, onAccount }: { user: User; onAccount: () => void }) {
  const [view, setView] = useState<FeedView>('all')
  const [section, setSection] = useState<'feed' | 'messages' | 'settings'>('feed')
  const [screenTimeMinutes, setScreenTimeMinutes] = useState(0)
  const [directorySearch, setDirectorySearch] = useState('')
  const [page, setPage] = useState<FeedPage>({ posts: [], nextCursor: null })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [feedError, setFeedError] = useState('')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [sharedPost, setSharedPost] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [mediaAlt, setMediaAlt] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [postError, setPostError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const publishLock = useRef(false)
  const feedVersion = useRef(0)
  const name = user.name || 'Buzzly member'

  const draftKey = `draft:${user.id}`

  useEffect(() => {
    const controller = new AbortController()
    void messagingRequest('/session', { method: 'POST', signal: controller.signal }).catch(() => undefined)
    return () => controller.abort()
  }, [user.id])

  useEffect(() => {
    const controller = new AbortController()
    void settingsRequest({ signal: controller.signal }).then((saved) => setScreenTimeMinutes(saved.screenTimeMinutes)).catch(() => undefined)
    return () => controller.abort()
  }, [user.id])

  const reminder = useScreenTimeReminder(user.id, screenTimeMinutes)

  useEffect(() => { setContent((current) => current || readLocal(draftKey)) }, [draftKey])

  useEffect(() => { writeLocal(draftKey, content) }, [draftKey, content])

  useEffect(() => { setSharedPost(new URLSearchParams(window.location.search).get('post')); setReady(true) }, [])

  useEffect(() => {
    if (!file) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    feedVersion.current += 1
    setLoading(true)
    setFeedError('')
    setPage({ posts: [], nextCursor: null })
    setLoadingMore(false)
    const parameters = new URLSearchParams({ view, q: query })
    if (sharedPost) parameters.set('post', sharedPost)
    socialRequest<FeedPage>(`?${parameters}`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setPage(result)
    }).catch((failure) => {
      if (!controller.signal.aborted) setFeedError(failure instanceof Error ? failure.message : 'Could not load your feed.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [view, query, refresh, ready, sharedPost])

  function selectView(next: FeedView) {
    setSection('feed')
    setView(next)
    setSharedPost(null)
    setQuery('')
    setQueryInput('')
    window.history.replaceState(null, '', '/')
  }

  async function loadMore() {
    if (loadingMore || !page.nextCursor) return
    const version = feedVersion.current
    setLoadingMore(true)
    setFeedError('')
    try {
      const parameters = new URLSearchParams({ view, q: query, cursor: page.nextCursor })
      const next = await socialRequest<FeedPage>(`?${parameters}`)
      if (version === feedVersion.current) setPage((previous) => ({ ...next, posts: [...previous.posts, ...next.posts.filter((item) => !previous.posts.some((existing) => existing.id === item.id))] }))
    } catch (failure) { if (version === feedVersion.current) setFeedError(failure instanceof Error ? failure.message : 'Could not load more posts.') }
    finally { if (version === feedVersion.current) setLoadingMore(false) }
  }

  function chooseFile(selected?: File) {
    setPostError('')
    if (!selected) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(selected.type)) { setPostError('Choose a JPG, PNG, WebP photo or MP4, WebM clip.'); return }
    if (selected.size > 4 * 1024 * 1024 || !selected.size) { setPostError('Choose a non-empty photo or short clip under 4 MB.'); return }
    setFile(selected)
    setMediaAlt('')
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (publishLock.current) return
    setPostError('')
    setNotice('')
    if (!content.trim() && !file) { setPostError('Write something or add a photo or clip.'); return }
    if (file && !mediaAlt.trim()) { setPostError('Describe your photo or clip so everyone can enjoy it.'); return }
    publishLock.current = true
    setPublishing(true)
    try {
      const body = new FormData()
      body.set('content', content)
      body.set('mediaAlt', mediaAlt)
      if (file) body.set('media', file)
      await socialRequest('', { method: 'POST', body })
      setContent('')
      setFile(null)
      setMediaAlt('')
      if (fileInput.current) fileInput.current.value = ''
      selectView('all')
      setRefresh((current) => current + 1)
      setNotice('Your moment is live. Let the conversation begin.')
    } catch (failure) { setPostError(failure instanceof Error ? failure.message : 'Your post could not be published. Your draft is still here.') }
    finally { publishLock.current = false; setPublishing(false) }
  }

  const heading = sharedPost ? 'A shared moment' : view === 'saved' ? 'Worth keeping.' : view === 'mine' ? 'Your little world.' : 'Your world, unfiltered.'
  const emptyHeading = query ? 'No moments match that search.' : sharedPost ? 'This moment is no longer here.' : view === 'saved' ? 'Keep the good stuff.' : view === 'photos' ? 'A picture starts it all.' : view === 'clips' ? 'Make the first move.' : view === 'mine' ? 'Your story starts here.' : 'A fresh space. Your first moment.'
  const emptyDescription = query ? 'Try another name or a different phrase.' : sharedPost ? 'The author may have deleted the post.' : view === 'saved' ? 'Tap the bookmark on any post to find it here later. Only you see your saved list.' : view === 'photos' ? 'Share a photo and give everyday moments a place to live.' : view === 'clips' ? 'Upload a short video. A little motion, a lot of personality.' : 'Share a thought, a photo, or a clip. Real people, real posts—no made-up feed.'

  return <div className="social-shell">
    <aside className="social-sidebar">
      <a className="brand" href="/" aria-label="Buzzly home"><span className="brand-icon"><Zap size={24} fill="currentColor" /></span><span>buzzly<span className="brand-dot">.</span></span></a>
      <span className="sidebar-caption">YOUR EVERYDAY, CONNECTED</span>
      <nav aria-label="Community navigation">
        <button className={section === 'feed' && view === 'all' ? 'selected' : ''} aria-current={section === 'feed' && view === 'all' ? 'page' : undefined} onClick={() => selectView('all')}><Home size={21} />Home feed</button>
        <button className={section === 'feed' && view === 'photos' ? 'selected' : ''} aria-current={section === 'feed' && view === 'photos' ? 'page' : undefined} onClick={() => selectView('photos')}><ImagePlus size={21} />Moments<span className="nav-tag">PHOTOS</span></button>
        <button className={section === 'feed' && view === 'clips' ? 'selected' : ''} aria-current={section === 'feed' && view === 'clips' ? 'page' : undefined} onClick={() => selectView('clips')}><Film size={21} />Clips</button>
        <button className={section === 'messages' ? 'selected' : ''} aria-current={section === 'messages' ? 'page' : undefined} onClick={() => { setDirectorySearch(''); setSection('messages') }}><Send size={21} />Messages</button>
        <button className={section === 'feed' && view === 'saved' ? 'selected' : ''} aria-current={section === 'feed' && view === 'saved' ? 'page' : undefined} onClick={() => selectView('saved')}><Bookmark size={21} />Saved</button>
        <button className={section === 'feed' && view === 'mine' ? 'selected' : ''} aria-current={section === 'feed' && view === 'mine' ? 'page' : undefined} onClick={() => selectView('mine')}><UserRound size={21} />My posts</button>
        <button className={section === 'settings' ? 'selected' : ''} aria-current={section === 'settings' ? 'page' : undefined} onClick={() => setSection('settings')}><Settings size={21} />Settings</button>
      </nav>
      {section === 'feed' && <button className="primary-button sidebar-create" onClick={() => { composer.current?.scrollIntoView({ block: 'center' }); composer.current?.focus() }}><Plus size={20} />Create a post</button>}
      <div className="sidebar-note"><Sparkles size={20} /><p>A little less noise.<br /><strong>A lot more you.</strong></p></div>
      <ThemeToggle className="sidebar-theme" />
      <button className="sidebar-account" onClick={onAccount}><span className="social-avatar">{initials(name)}</span><span><strong>{name}</strong><small>Account & settings</small></span><ArrowRight size={17} /></button>
    </aside>

    <main className="social-main">
      {reminder.due && <div className="screen-time-reminder" role="status"><Sparkles size={17} /><p>You’ve reached your daily time on Buzzly. Maybe a good moment for a little break?</p><button className="text-button" onClick={reminder.dismiss}>Dismiss for today</button></div>}
      {section === 'messages' ? <DirectMessaging user={user} onAccount={onAccount} initialQuery={directorySearch} /> : section === 'settings' ? <AppSettings onAccount={onAccount} onSaved={(saved) => setScreenTimeMinutes(saved.screenTimeMinutes)} /> : <>
      <header className="feed-header"><div><span className="eyebrow"><span /> THE BUZZ STARTS HERE</span><h1>{heading}</h1><p>Your thoughts. Your moments. Your kind of people.</p></div><div className="feed-header-actions"><ThemeToggle className="icon-button mobile-account" /><button className="icon-button mobile-account" onClick={onAccount} aria-label="Open account settings"><UserRound size={22} /></button></div></header>
      <SearchBar value={queryInput} onChange={setQueryInput} onSearch={(term) => { setSharedPost(null); setQuery(term); window.history.replaceState(null, '', '/') }} onPost={(id) => { setView('all'); setQuery(''); setSharedPost(id); window.history.replaceState(null, '', `/?post=${encodeURIComponent(id)}`) }} onMembers={(term) => { setDirectorySearch(term); setSection('messages') }} />

      <form className="post-composer" onSubmit={publish} aria-busy={publishing}>
        <div className="composer-top"><span className="social-avatar">{initials(name)}</span><div><label htmlFor="post-content">Got something on your mind, {name.split(' ')[0]}?</label><textarea id="post-content" ref={composer} value={content} onChange={(event) => setContent(event.target.value)} placeholder="A thought. A moment. A little bit of you." maxLength={2000} disabled={publishing} rows={3} /></div></div>
        {file && <div className="attachment-preview">{preview && (file.type.startsWith('video/') ? <video src={preview} controls playsInline preload="metadata" /> : <img src={preview} alt={mediaAlt || 'Your selected photo preview'} />)}<button type="button" className="icon-button remove-attachment" aria-label="Remove attachment" disabled={publishing} onClick={() => { setFile(null); setMediaAlt(''); if (fileInput.current) fileInput.current.value = '' }}><X size={17} /></button><label htmlFor="media-description">Describe this {file.type.startsWith('video/') ? 'clip' : 'photo'}<span>For accessibility · required</span></label><input id="media-description" value={mediaAlt} onChange={(event) => setMediaAlt(event.target.value)} maxLength={300} disabled={publishing} placeholder="What’s happening in this moment?" required /><small>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</small></div>}
        <div className="composer-actions"><input className="sr-only" id="post-media" ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={publishing} onChange={(event) => chooseFile(event.target.files?.[0])} /><button type="button" className="media-button" disabled={publishing} onClick={() => { if (fileInput.current) { fileInput.current.accept = 'image/jpeg,image/png,image/webp'; fileInput.current.click() } }}><ImagePlus size={19} />Photo</button><button type="button" className="media-button" disabled={publishing} onClick={() => { if (fileInput.current) { fileInput.current.accept = 'video/mp4,video/webm'; fileInput.current.click() } }}><Film size={19} />Clip</button><span className="character-count">{content.length}/2,000</span><button type="submit" className="primary-button publish-button" disabled={publishing || (!content.trim() && !file)}>{publishing ? 'Posting…' : 'Post'}<ArrowRight size={17} /></button></div>
        <p className="composer-privacy"><UsersRound size={13} />Shared with the Buzzly community · media up to 4 MB</p>
        {postError && <p className="social-error" role="alert">{postError}</p>}
      </form>
      {notice && <p className="social-notice feed-notice" role="status"><Check size={16} />{notice}</p>}

      <div className="feed-toolbar">{sharedPost ? <button className="text-button" onClick={() => selectView('all')}><ChevronLeft size={16} />Back to the buzz</button> : <div className="feed-tabs" role="group" aria-label="Filter community feed">{(['all', 'photos', 'clips'] as const).map((tab) => <button key={tab} aria-pressed={view === tab} className={view === tab ? 'active' : ''} onClick={() => selectView(tab)}>{tab === 'all' ? 'Latest' : tab === 'photos' ? 'Photos' : 'Clips'}</button>)}{(view === 'saved' || view === 'mine') && <span className="current-feed">{view === 'saved' ? 'Your saved posts' : 'Your posts'}</span>}</div>}<button className="icon-button" aria-label="Refresh feed" disabled={loading} onClick={() => setRefresh((current) => current + 1)}><RefreshCw size={17} className={loading ? 'refreshing' : ''} /></button></div>
      {query && <div className="search-status">Results for “{query}”<button aria-label="Clear search" className="icon-button" onClick={() => { setQuery(''); setQueryInput('') }}><X size={15} /></button></div>}
      <section className={`feed-posts ${view === 'photos' ? 'photo-feed' : ''} ${view === 'clips' ? 'clip-feed' : ''}`} aria-label="Community posts" aria-busy={loading}>
        {loading ? <div className="feed-skeleton" role="status"><span className="sr-only">Loading posts</span><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : <>
          {page.posts.map((post) => <PostCard key={post.id} post={post} user={user} onChange={(updated) => setPage((previous) => ({ ...previous, posts: previous.posts.flatMap((item) => item.id === updated.id ? view === 'saved' && !updated.saved ? [] : [updated] : [item]) }))} onDelete={(id) => { setPage((previous) => ({ ...previous, posts: previous.posts.filter((item) => item.id !== id) })); setNotice('Your post has been deleted.') }} />)}
          {!page.posts.length && !feedError && <div className="feed-empty"><div className="empty-art"><span /><Zap size={34} /><span /></div><span className="eyebrow">LESS NOISE. MORE REAL.</span><h2>{emptyHeading}</h2><p>{emptyDescription}</p>{!query && !sharedPost && view !== 'saved' && <button className="primary-button" onClick={() => composer.current?.focus()}>Share a moment<Plus size={18} /></button>}</div>}
        </>}
      </section>
      {feedError && <div className="feed-failure" role="alert"><p>{feedError}</p><button className="secondary-button" onClick={() => page.posts.length ? void loadMore() : setRefresh((current) => current + 1)}>Try again<RefreshCw size={15} /></button></div>}
      {page.nextCursor && !loading && <button className="load-more secondary-button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Finding more moments…' : 'More from the community'}<ArrowDown size={16} /></button>}
      <footer className="feed-footer">You bring the moments. We keep them connected.</footer>
      </>}
    </main>

    <aside className="social-right" aria-label="About the community"><div className="community-note"><span className="eyebrow">ONE SPACE. ALL OF YOU.</span><div className="note-orbit"><Zap size={32} fill="currentColor" /><Sparkles size={22} /></div><h2>Big thoughts.<br />Little moments.<br /><span>Real connections.</span></h2><p>A quick update, a camera-roll favorite, or a clip worth sharing. There’s room for it here.</p><span className="community-note-footer"><span />Made for your everyday</span></div><div className="community-guide"><h3>A good kind of social<Heart size={17} /></h3><p>Be kind. Give credit. Share only what’s yours to share.</p><p>Posts are visible to signed-in members. Saved posts stay in your private collection.</p><button onClick={onAccount}>Make yourself at home<ArrowUpRight size={16} /></button></div><div className="right-footer">BUZZLY · LESS NOISE, MORE YOU</div></aside>
  </div>
}
