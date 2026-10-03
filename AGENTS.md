# Buzzly

Buzzly is a social experience built with React 19, TypeScript, TanStack Start, Netlify Identity, Netlify Database, and Netlify Blobs. It is a new Netlify project inspired by the linked Buzzly site; the original source and user database were not provided. Existing accounts on the original host are not migrated.

## Architecture

- `src/routes/index.tsx` renders the Buzzly experience at `/`.
- `src/routes/__root.tsx` provides the HTML shell, stylesheet import, favicon, and sharing metadata.
- `src/components/Buzzly.tsx` contains the brand presentation, illustrative community preview, authentication forms, help dialog, and signed-in account panel.
- `src/components/ProfileSettings.tsx` edits the signed-in user's display name, email, private phone number, bio, and profile photo. Profile fields persist in Identity metadata; email changes require confirmation.
- `netlify/functions/profile-avatar.mts` stores profile photos in Netlify Blobs with authenticated, owner-only access, same-origin mutations, a 4 MB limit, required descriptions, and file-signature validation.
- `src/components/SocialFeed.tsx` contains the signed-in feed, photo and clip views, composer, reactions, bookmarks, and comments.
- `src/components/DirectMessaging.tsx` contains the private inbox, searchable member directory, follow controls, followed-member filter, and paginated one-to-one chats.
- `src/lib/messaging.ts` contains messaging types and same-origin browser requests. `netlify/functions/messaging.mts` validates sessions, owns directory registration, and restricts conversations and messages to their two participants.
- `netlify/functions/messaging-members.mts` synchronizes directory display-name changes and removes directory records, follows, and conversations when an Identity account is deleted.
- `src/components/AppSettings.tsx` is the signed-in Settings & Privacy page. Only enforced settings are editable: who can message the member (everyone, people they follow, nobody), hidden words, and a daily time reminder. Unbuilt features (private accounts, tagging, close friends, sensitive-content filtering, remixes, downloads, quiet mode) appear disabled and labeled "Coming soon"; email and phone lookup is shown as always private.
- `netlify/functions/settings.mts` reads and saves the signed-in member's settings in `buzzly_member_settings`. `db/settings.ts` provides shared helpers: messaging enforces the recipient's message policy on new conversations and sends, and comments and received messages matching the viewer's hidden words are filtered server-side (the viewer's own content is never hidden).
- `src/lib/social.ts` contains shared API types and browser-side requests.
- `netlify/functions/social.mts` validates Identity sessions and authorizes all community and media operations server-side.
- `db/schema.ts` defines posts, likes, private bookmarks, and comments; Drizzle migrations live in `netlify/database/migrations` and are applied by Netlify during deployment.
- The messaging schema stores directory display names, private follow relationships, unique participant pairs, and messages with idempotent send identifiers. A new forward-only migration adds these tables without modifying applied migrations.
- `src/lib/storage.ts` wraps LocalStorage for non-sensitive conveniences only: the last-used email, per-user post drafts, and the per-user daily usage counter for the time reminder, which are cleared on sign-out. Never store passwords, tokens, or account records there.
- `src/lib/auth.ts` maps authentication errors to safe, actionable messages without exposing raw service responses.
- `src/styles.css` defines the responsive dark-and-rose design, form states, and reduced-motion support.
- `public/images/` contains the static scenic image used in the clearly labeled preview, served through Netlify Image CDN.
- `.netlify/features/netlify-identity` enables the Identity service on deployment.

## Authentication

Use only `@netlify/identity` for authentication. Account data and display-name metadata persist in Netlify Identity; passwords and tokens must never be stored by application code, logged, or embedded in UI. Authentication mutations run in the browser, not during SSR. The SDK manages session restoration, refresh, and cross-tab events.

Call `handleAuthCallback()` on initial client load before determining which panel to display. Recovery must show a new-password form, not the ordinary signed-in panel. Invite tokens remain transient and are consumed through `acceptInvite`. Signup confirmation is detected using `User.confirmedAt`; the installed SDK does not expose `emailVerified`. Show Google sign-in only when enabled in Identity settings. Respect closed registrations.

The landing-page cards are illustrative, not a real feed. The signed-in feed uses actual Netlify Database records with Drizzle; uploaded photos and clips use Netlify Blobs. Do not invent posts, engagement counters, follower networks, messaging, or story features. All posts and media require authentication to read; bookmarks are private to their owner. Mutations require same-origin requests. Post deletion requires author ownership and cascades to reactions and comments. Media has a 4 MB limit, requires an accessible description, and uses server-side file-signature validation. Any future server endpoint must validate authentication server-side rather than relying on the visible account panel.

Messaging and follows use real Netlify Database records, never sample users or conversations. The directory registers authenticated members when they open the signed-in community and exposes only display names and member IDs, not emails, phone numbers, or account metadata. Follow relationships are private to the follower; following is not required to send a message. One-to-one messages are readable and writable only by their two participants, are limited to 2,000 characters, and are not end-to-end encrypted. New and older messages and inbox/directory pages use bounded cursor pagination. Deleted Identity accounts cascade to their directory records, follows, conversations, and messages.

## Conventions

Use strict TypeScript, PascalCase components, camelCase utilities, and `@/` imports. Keep error feedback inline and accessible. Use real buttons for actions, associated labels for inputs, and native dialog behavior. Maintain mobile layouts and reduced-motion preferences. Do not add unnecessary libraries or inline comments. Keep finished product metadata free of template placeholders and do not add an `og:image`.

## Development

Install with `pnpm install`. Develop the UI locally through `netlify dev --port 8889`; validate real Identity and email flows on a deployed Netlify preview or production site. Deployment uses the existing Vite/TanStack Start integration. During agent work, do not run build, start, typecheck, or test commands: the platform validates automatically. The Identity activation script is `/opt/buildhome/.agents/skills/netlify-identity/scripts/enable.cjs` and has already been run for this project.
