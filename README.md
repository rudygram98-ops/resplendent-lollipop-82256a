# Buzzly

A welcoming, responsive social experience for Buzzly — social that hits different. Users can create an account, confirm their email, sign in, and share text, photos, and short video clips with the community. A conversational home feed, photo-focused Moments view, and video-focused Clips view bring different ways of sharing into one space.

## Technology

React 19, TypeScript, TanStack Start and Router, Vite, custom CSS with Tailwind CSS 4, Lucide icons, and `@netlify/identity`. Netlify Identity securely persists user accounts and profile metadata and manages sessions. Netlify Database with Drizzle stores posts, likes, comments, and private bookmarks; Netlify Blobs stores uploaded media. The signed-out landing card remains a clearly labeled illustration. The signed-in feed contains real community posts, with an honest empty state until members publish.

## Community features

Signed-in members can publish up to 2,000 characters with an optional photo or short clip, like posts, add comments, save posts privately, copy a post link, search posts and author names, and delete their own posts. Latest, Photos, Clips, Saved, and My posts views use paginated database queries. Shared links open the selected post after sign-in. All posts are visible to signed-in members, not the public web; there is no follower network, private messaging, algorithmic ranking, or story-expiration system.

Uploads accept JPG, PNG, WebP, MP4, or WebM files up to 4 MB. Media descriptions are required for accessibility. Short videos use native playback controls and do not autoplay. Upload sizes and file signatures are validated server-side. Media is served through an authenticated endpoint with byte-range support for video playback. Every API operation validates the Identity session, mutations require a same-origin request, and only the author can delete a post. Deleting a post also removes its reactions and comments and requests deletion of the associated media.

The schema lives in `db/schema.ts`, with Drizzle migrations in `netlify/database/migrations`. Netlify provisions the database and applies migrations during deployment; do not apply migrations manually. Preview database branches are separate from production. Uploaded media uses site-level Blob storage. Account and email flows still include password recovery, invitations, display-name editing, and sign-out.

## Run locally

```sh
pnpm install
netlify dev --port 8889
```

Link the project to its Netlify site and ensure Netlify Identity is enabled. Use the Netlify development server for local UI development. Validate the complete account and email-link flows on a deployed Netlify preview or production site, where the managed Identity service is available. Never add credentials to the source code.

## Account setup

Registration is open by default, and new users receive an email confirmation link. The landing page processes confirmation, password recovery, and invitation callbacks automatically. Google sign-in appears only if that provider is enabled in the Netlify project's Identity settings. Identity activation is requested by `.netlify/features/netlify-identity` on deploy.

The original linked Buzzly source and database were not available in this empty workspace. This implementation is a new Netlify-hosted account experience with matching branding. Accounts, posts, and messages from the original host were not migrated, and existing users must create a new account here. Authentication emails should use this Netlify site's URL, not the original host.

## Project structure

`src/components/Buzzly.tsx` contains account flows and the landing presentation. `src/components/SocialFeed.tsx` contains the signed-in social experience. `src/lib/social.ts` provides typed client requests and safe feedback. `netlify/functions/social.mts` handles authenticated community and media requests. `src/lib/auth.ts` provides safe account error messages. `src/styles.css` provides the responsive theme. `src/routes/__root.tsx` contains finished page metadata.

The Netlify deployment pipeline installs dependencies and validates the application automatically.
