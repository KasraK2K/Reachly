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

1. **Campaign → Create draft:** one first message is rendered per lead (variants rotate round-robin) so you can review and edit every message before sending. Leads already messaged or queued are excluded. Optional **follow-ups** (up to 5, each 1–30 days after the previous step) are rendered and queued when the previous step is sent.
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
pnpm --filter @reachly/api test      # engine, inbox webhooks, lockout (needs Postgres)
```

**Stop on reply:** a follow-up is only handed out while the lead is still *New* or *Contacted*. Marking a lead *Replied*, *Converted* or *Not interested* (in Leads, in the Reply assistant, or through a Calendly booking) cancels everything still queued for them.

## More features

- **Analytics:** reply and conversion rate per campaign and per first-message variant (A/B), messages sent over the last 14 days, and a CSV export of all leads (Leads → Export CSV). Replies are counted from lead statuses.
- **Reply assistant (AI, suggestions only):** describe your persona, offer, goal, objections and handoff rules once, then paste a DM thread (or press *Suggest replies* in an Inbox thread) to get three reply drafts. Each Instagram account can have its own setup or use the default. Nothing is ever sent automatically. Needs `ANTHROPIC_API_KEY` in `apps/api/.env`; uses `claude-opus-5-5`.
- **Calendly:** Settings → Calendly creates a secret webhook URL. Subscribe it to `invitee.created` and pass the lead's handle as `utm_content` on your booking link (or ask for it in a booking question). A booking marks the lead Converted and cancels their follow-ups. The web app must be reachable from the internet for Calendly to call it.
- **Inbox:** connect an account through Instagram Login (Settings → *Connect Instagram*) and replies arrive in **Inbox** through Meta's webhooks. A reply marks the matching lead *Replied* and cancels its follow-ups automatically. You can answer from Reachly within Instagram's 24-hour window; after that, use the Instagram app. Setup is below.
- **Dashboard:** unread-replies banner, setup progress, and a feed of recent sends, failures and replies.
- **Account:** users can change their own password in Settings. Sign-in lockout is stored in Postgres, so it holds across API instances.

## Inbox setup (Meta app)

The inbox uses the official *Instagram API with Instagram Login*. The sending account must be an Instagram **Business or Creator** account; no Facebook Page is needed.

1. Expose the web app over HTTPS (Meta won't call `localhost`), e.g. `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`.
2. In [Meta for Developers](https://developers.facebook.com/apps), create an app (type *Business*), add the **Instagram** product, and open *API setup with Instagram login*.
3. Put these in `apps/api/.env` and restart the API:
   - `IG_APP_ID`, `IG_APP_SECRET`: the **Instagram** app ID and secret from that page (not the Meta app ID).
   - `APP_URL`: your public HTTPS URL, no trailing slash.
   - `IG_WEBHOOK_VERIFY_TOKEN`: any random string.
4. On that page, set:
   - **Business login** redirect URL: `$APP_URL/api/meta/callback`
   - **Webhooks** callback URL: `$APP_URL/api/webhooks/instagram`, with the verify token from step 3, then subscribe to the `messages` field.
   - **Deauthorize** callback URL: `$APP_URL/api/meta/deauthorize`
   - **Data deletion request** URL: `$APP_URL/api/meta/data-deletion` (its status page is `/data-deletion`).
5. Until the app passes App Review, only Instagram accounts added as testers (App roles → Roles → *Instagram Tester*, accepted in the Instagram app) can connect, and webhooks only arrive while the app is in Live mode with *Advanced Access* for `instagram_business_manage_messages`.
6. Open Reachly through the public URL, go to Settings → *Connect Instagram* and log into the same account as the handle.

The app asks for only `instagram_business_basic` and `instagram_business_manage_messages`. App Review needs a screencast of connecting an account, receiving a DM in Inbox and replying. Tokens are stored encrypted and refreshed automatically before their 60 days run out. The encryption key is derived from `INTERNAL_JWT_SECRET`, so if you change that secret, accounts have to reconnect.

## Known limits

- Instagram markup changes will break sending. All selectors and text matchers live in `apps/extension/lib/selectors.ts`. They cover English, Spanish, Portuguese, French, German, Italian, Turkish, Persian, Arabic and Russian, but only English has been checked against the live site.
- Reply detection only works for accounts connected to the Instagram API. For any other account, mark a lead *Replied* in Leads yourself, or a follow-up can still reach someone who already answered.
- A reply is matched to a lead by Instagram username, so a lead whose handle has since changed won't be matched.
- The inbox refreshes every 15 seconds while it's open; it isn't instant.
- Chrome must stay open while sending. `chrome.alarms` fires at most every 30 s, so delays shorter than 30 s are effectively 30 s.
- Pacing lowers the risk of Instagram restricting an account. It doesn't remove that risk.


- The inbox has only been tested with simulated Meta webhooks; it still needs a run against a real Meta app.

Not built yet: comment-to-DM and welcome-DM automations, AI autopilot, AI lead scoring, billing, teams/workspaces.
