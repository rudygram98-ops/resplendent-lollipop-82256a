# Buzzly

Buzzly is a social experience built with React 19, TypeScript, TanStack Start, Netlify Identity, Netlify Database, and Netlify Blobs. It is a new Netlify project inspired by the linked Buzzly site; the original source and user database were not provided. Existing accounts on the original host are not migrated.

## Architecture

- `src/routes/index.tsx` renders the Buzzly experience at `/`.
- `src/routes/__root.tsx` provides the HTML shell, stylesheet import, favicon, and sharing metadata.
- `src/components/Buzzly.tsx` contains the brand presentation, illustrative community preview, authentication forms, help dialog, and signed-in account panel.
- `src/components/SocialFeed.tsx` contains the signed-in feed, photo and clip views, composer, reactions, bookmarks, and comments.
- `src/lib/social.ts` contains shared API types and browser-side requests.
- `netlify/functions/social.mts` validates Identity sessions and authorizes all community and media operations server-side.
- `db/schema.ts` defines posts, likes, private bookmarks, and comments; Drizzle migrations live in `netlify/database/migrations` and are applied by Netlify during deployment.
- `src/lib/auth.ts` maps authentication errors to safe, actionable messages without exposing raw service responses.
- `src/styles.css` defines the responsive dark-and-rose design, form states, and reduced-motion support.
- `public/images/` contains the static scenic image used in the clearly labeled preview, served through Netlify Image CDN.
- `.netlify/features/netlify-identity` enables the Identity service on deployment.

## Authentication

Use only `@netlify/identity` for authentication. Account data and display-name metadata persist in Netlify Identity; passwords and tokens must never be stored by application code, logged, or embedded in UI. Authentication mutations run in the browser, not during SSR. The SDK manages session restoration, refresh, and cross-tab events.

Call `handleAuthCallback()` on initial client load before determining which panel to display. Recovery must show a new-password form, not the ordinary signed-in panel. Invite tokens remain transient and are consumed through `acceptInvite`. Signup confirmation is detected using `User.confirmedAt`; the installed SDK does not expose `emailVerified`. Show Google sign-in only when enabled in Identity settings. Respect closed registrations.

The landing-page cards are illustrative, not a real feed. The signed-in feed uses actual Netlify Database records with Drizzle; uploaded photos and clips use Netlify Blobs. Do not invent posts, engagement counters, follower networks, messaging, or story features. All posts and media require authentication to read; bookmarks are private to their owner. Mutations require same-origin requests. Post deletion requires author ownership and cascades to reactions and comments. Media has a 4 MB limit, requires an accessible description, and uses server-side file-signature validation. Any future server endpoint must validate authentication server-side rather than relying on the visible account panel.

## Conventions

Use strict TypeScript, PascalCase components, camelCase utilities, and `@/` imports. Keep error feedback inline and accessible. Use real buttons for actions, associated labels for inputs, and native dialog behavior. Maintain mobile layouts and reduced-motion preferences. Do not add unnecessary libraries or inline comments. Keep finished product metadata free of template placeholders and do not add an `og:image`.

## Development

Install with `pnpm install`. Develop the UI locally through `netlify dev --port 8889`; validate real Identity and email flows on a deployed Netlify preview or production site. Deployment uses the existing Vite/TanStack Start integration. During agent work, do not run build, start, typecheck, or test commands: the platform validates automatically. The Identity activation script is `/opt/buildhome/.agents/skills/netlify-identity/scripts/enable.cjs` and has already been run for this project.
