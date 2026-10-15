# Reachly

Outbound Instagram DMs at human pace: import leads, write message variants, and send them from your own Instagram account through a Chrome extension.

Instagram's official API can't send the first message to someone, so cold DMs go out through **apps/extension**, which drives instagram.com in your own logged-in browser. Every limit (daily cap, delay between messages, quiet hours, auto-pause) is enforced **server-side per Instagram account**. That way two browsers sending for the same account share one counter.

```
apps/web        Next.js 15 (App Router) + Tailwind + shadcn/Radix. UI + BFF proxy (/api/* → API)
apps/api        NestJS (Fastify) + Prisma + Postgres. Leads, templates, campaigns, sending engine
apps/extension  Chrome MV3 extension (WXT). Claims jobs, types messages into instagram.com
packages/shared Merge fields + spintax renderer, handle normalisation, shared enums
```

## Run locally

Requirements: Node 22+, pnpm 10, Docker.

```bash
docker compose up -d                          # Postgres on :5432
pnpm install
cp apps/api/.env.example apps/api/.env        # set INTERNAL_JWT_SECRET
cp apps/web/.env.example apps/web/.env.local  # same INTERNAL_JWT_SECRET, AUTH_SECRET (Google keys optional)
cp apps/extension/.env.example apps/extension/.env
pnpm --filter @reachly/api db:migrate
pnpm --filter @reachly/extension build        # extension → apps/extension/.output/chrome-mv3
pnpm dev                                      # web :3000, api :4000 (also rebuilds the extension once)
```

**Signing in**

1. **First run:** open http://localhost:3000. With no admin in the database you are sent to **/setup**, where you create the admin account (email and password). That page disappears once an admin exists.
2. **Everyone else:** there is no public sign-up. The admin adds people on the **Users** page, with a temporary password, or with no password for Google-only users. Each user has their own leads, templates and campaigns.
3. **Google (optional):** set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `apps/web/.env.local` (OAuth client type "Web application", redirect URI `http://localhost:3000/api/auth/callback/google`). The button appears only when both are set, and it only lets in emails the admin has added.

Five wrong passwords for one email lock that email out for 15 minutes.

**Chrome extension**

1. Build it: `pnpm --filter @reachly/extension build`. The URLs in `apps/extension/.env` are baked in at build time, so rebuild after changing them.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.
3. In Reachly, open **Settings → Connect extension**. Then open the extension popup, pick the account and press **Start**.
4. After any change to extension code, run the build command again and click the reload icon on **Reachly Sender** in `chrome://extensions`. The extension does not rebuild on its own.

## How a message gets sent

1. **Campaign → Create draft:** one message is rendered per lead (variants rotate round-robin) so you can review and edit every message before sending. Leads already messaged or queued are excluded.
2. **Start sending:** the extension calls `POST /extension/claim` about every minute. The API locks the account row and checks, in order: paused, Instagram login present and matching the bound account, one send at a time, delay since the last send, rolling 24h cap, and quiet hours in the lead's timezone (falling back to the account's). It then hands out one job.
3. The extension opens the lead's profile in a pinned tab, clicks **Message**, types the text one character at a time (30–120 ms per character, timed from the service worker so background-tab throttling doesn't apply), sends it, and reports the result.
4. **Results:**
   - Lead-level failures (user not found, can't be messaged) skip that lead.
   - Blocks, rate limits, logouts, or a wrong account pause the account at once.
   - Any other failure retries once. Three in a row pause the account if "pause on errors" is on.
   - Resuming a paused account is always a manual click.

Defaults for new accounts: 20 messages per 24h, 45–120 s between messages, quiet hours 22:00–07:00.

## Tests

```bash
pnpm --filter @reachly/shared test   # renderer/spintax/handles
pnpm --filter @reachly/api test      # engine: concurrency, pacing, cap, pause, quiet hours (needs Postgres)
```

## Known limits (milestone 1)

- Instagram markup changes will break sending. All selectors and text matchers live in `apps/extension/lib/selectors.ts`, and they assume the Instagram UI is set to **English**.
- Replies aren't detected yet: there's no inbox or Graph API. Mark a lead *Replied* / *Not interested* in Leads, and any queued messages to that lead are cancelled.
- Chrome must stay open while sending. `chrome.alarms` fires at most every 30 s, so delays shorter than 30 s are effectively 30 s.
- Pacing lowers the risk of Instagram restricting an account. It doesn't remove that risk.

Not built yet: Meta OAuth + inbox, follow-up steps with stop-on-reply, AI reply assistant, analytics, billing, multi-rep.
