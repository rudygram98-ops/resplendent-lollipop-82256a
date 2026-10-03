import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { messagingRequest } from '@/lib/messaging'
import type { Member } from '@/lib/messaging'
import { socialRequest } from '@/lib/social'
import type { SocialPost } from '@/lib/social'

type SearchResults = {
  query: string
  members: Member[]
  posts: SocialPost[]
  memberError: string
  postError: string
}

export default function SearchBar({ value, onChange, onSearch, onPost, onMembers }: {
  value: string
  onChange: (value: string) => void
  onSearch: (query: string) => void
  onPost: (id: string) => void
  onMembers: (query: string) => void
}) {
  const [results, setResults] = useState<SearchResults | null>(null)
  const [retry, setRetry] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const query = value.trim()

  useEffect(() => {
    if (!query) { setResults(null); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams({ q: query })
      void Promise.allSettled([
        messagingRequest<{ members: Member[] }>(`/members?${parameters}`, { signal: controller.signal }),
        socialRequest<{ posts: SocialPost[] }>(`?${parameters}`, { signal: controller.signal }),
      ]).then(([memberResult, postResult]) => {
        if (controller.signal.aborted) return
        setResults({
          query,
          members: memberResult.status === 'fulfilled' ? memberResult.value.members : [],
          posts: postResult.status === 'fulfilled' ? postResult.value.posts : [],
          memberError: memberResult.status === 'rejected' ? 'Could not search members. Please try again.' : '',
          postError: postResult.status === 'rejected' ? 'Could not search posts and topics. Please try again.' : '',
        })
      })
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, retry])

  const loading = results?.query !== query
  const topics = [...new Set((results?.posts || []).flatMap((post) =>
    (post.content.match(/#[\p{L}\p{N}_]+/gu) || []).map((topic) => topic.toLowerCase()),
  ))].filter((topic) => topic.includes(query.toLowerCase())).slice(0, 8)

  function searchPosts(term: string) {
    const boundedTerm = term.slice(0, 100)
    onChange(boundedTerm)
    onSearch(boundedTerm.trim())
    setDismissed(true)
  }

  return <div className="community-search" onKeyDown={(event) => { if (event.key === 'Escape') setDismissed(true) }}>
    <form className="feed-search" role="search" onSubmit={(event) => { event.preventDefault(); searchPosts(value) }}>
      <Search size={18} aria-hidden="true" />
      <label className="sr-only" htmlFor="feed-search">Search users, posts, or topics</label>
      <input id="feed-search" type="search" value={value} maxLength={100} autoComplete="off" placeholder="Search users, posts, or topics…" onFocus={() => setDismissed(false)} onChange={(event) => { onChange(event.target.value); setDismissed(false) }} />
      {value && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { onChange(''); onSearch(''); setDismissed(false) }}><X size={16} /></button>}
      <button type="submit">Search</button>
    </form>
    {query && !dismissed && <section className="community-search-results" aria-label="Search results" aria-busy={loading}>
      {loading ? <p role="status">Searching the community…</p> : <>
        <p className="sr-only" role="status">Search results for {query}: {results?.members.length || 0} users and {results?.posts.length || 0} posts on the first page.</p>
        <section aria-labelledby="search-users-heading">
          <h2 id="search-users-heading">Users</h2>
          {results?.memberError ? <p className="social-error" role="alert">{results.memberError}</p> : results?.members.length ? <>
            <ul>{results.members.slice(0, 5).map((member) => <li key={member.id}><button type="button" onClick={() => { setDismissed(true); onMembers(member.name) }}>{member.name}</button></li>)}</ul>
            <button type="button" className="text-button" onClick={() => onMembers(query)}>Search the member directory</button>
          </> : <p>No matching members.</p>}
        </section>
        <section aria-labelledby="search-posts-heading">
          <h2 id="search-posts-heading">Posts</h2>
          {results?.postError ? <p className="social-error" role="alert">{results.postError}</p> : results?.posts.length ? <>
            <ul>{results.posts.slice(0, 5).map((post) => <li key={post.id}><button type="button" onClick={() => { setDismissed(true); onPost(post.id) }}><strong>{post.authorName}</strong><span>{post.content || post.mediaAlt || 'Media post'}</span></button></li>)}</ul>
            <button type="button" className="text-button" onClick={() => searchPosts(value)}>Search posts in this feed</button>
          </> : <p>No matching posts.</p>}
        </section>
        <section aria-labelledby="search-topics-heading">
          <h2 id="search-topics-heading">Topics</h2>
          <p>Hashtags from the first page of matching posts.</p>
          {results?.postError ? <p>Topics are unavailable while post search is unavailable.</p> : topics.length ? <ul className="search-topics">{topics.map((topic) => <li key={topic}><button type="button" onClick={() => searchPosts(topic)}>{topic}</button></li>)}</ul> : <p>No matching hashtags in these posts.</p>}
        </section>
        {(results?.memberError || results?.postError) && <button type="button" className="text-button" onClick={() => { setResults(null); setRetry((current) => current + 1) }}>Try again</button>}
      </>}
    </section>}
  </div>
}
