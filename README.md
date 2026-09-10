# Slack Message Cleanup

[![Deploy](https://github.com/minmboy/slack-cleaner/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/minmboy/slack-cleaner/actions/workflows/deploy-pages.yml)

Manage your own Slack history: review what you have posted, then delete the messages — and optionally the
files you attached — that you want gone. **There is no backend.** It builds to static files and talks to
Slack directly from your browser.

### → [minmboy.github.io/slack-cleaner](https://minmboy.github.io/slack-cleaner/)

Or run it yourself, which is the stronger option for a tool you hand a token to:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ deploys to any static host
```

Available in English and Korean — switcher in the top right.

Before pasting a token into any copy of this tool — the hosted one included — read
[Verifying this tool yourself](#verifying-this-tool-yourself). It takes about a minute.

---

## Why a frontend-only app is possible

Slack's Web API returns `access-control-allow-origin: *`, so a browser can call it directly.
Two constraints shaped everything else.

**1. You cannot use the `Authorization` header.**
Slack's `access-control-allow-headers` does not include `authorization`, so sending the token as a
header gets the request rejected at the CORS preflight. This app puts the token in a
**form-urlencoded body** instead. Passing `URLSearchParams` as `body` makes fetch set
`content-type: application/x-www-form-urlencoded`, which is a CORS-safelisted value — so no preflight
is ever issued. See [`src/lib/slack.ts`](src/lib/slack.ts).

**2. You cannot use OAuth.**
`oauth.v2.access` requires a `client_secret`, which cannot live in frontend code. So instead of an
OAuth flow, **you create an app in your own workspace and paste its User Token**. That is not a
compromise — see the next section.

---

## Rate limits: why this shape is the only one that works

Since May 29, 2025, Slack limits `conversations.history` and `conversations.replies` to
**one request per minute, 15 objects maximum** for commercially distributed apps that are not approved
for the Slack Marketplace. Under that limit, scanning thousands of messages is not practical.

> Marketplace-approved apps and **internal customer-built apps are not affected.**
> — [Slack changelog](https://api.slack.com/changelog/2025-05-terms-rate-limit-update-and-faq)

An app you build and install only in your own workspace falls squarely in that exemption, so it keeps
**Tier 3 (50/min)**. Enabling Distribution on the app would put you back under the strict limit, so
**keep the app private.**

The client paces requests per method (Slack meters per method, per workspace) and, on a 429, waits out
the `Retry-After` header — which Slack does expose to JavaScript via `access-control-expose-headers`.
If responses start coming back 15 at a time, the app flags it as the throttled case.

---

## How it works

| Step | What happens |
| --- | --- |
| Connect | Copy the app manifest → create and install the app → paste the `xoxp-` User Token → `auth.test` |
| Pick conversations | `conversations.list` plus `users.list` (names resolve in the background). Optional start date narrows the scan |
| Scan | `conversations.history`, then `conversations.replies` for every message with `reply_count > 0`. Keeps only messages where `user` matches your own ID |
| Review | A checkbox per message. Filter by date, keyword, thread, or attachment; select or clear whole conversations |
| Delete | Type the confirmation word → `chat.delete`, one call per message. Progress, per-message failure reasons, CSV export |

**Thread replies are deleted before their roots.** Deleting a root first leaves its replies stranded
under a "message deleted" placeholder.

---

## Verifying this tool yourself

The repository is public so you can check it rather than take anyone's word for it. Before pasting a
token, look at the following.

**1. There are only two dependencies.** The `dependencies` in [`package.json`](package.json) are
`react` and `react-dom`. No external CDN scripts, no analytics, no web fonts. The i18n layer is
hand-rolled for the same reason — adding a translation library would widen the surface you have to audit.

**2. There is exactly one place a network request leaves from.**

```bash
grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon" src/
```

One hit: `fetch(API_BASE + method, ...)` in [`src/lib/slack.ts`](src/lib/slack.ts). `API_BASE` is
pinned to `https://slack.com/api/` at the top of the same file.

**3. Storage is limited to two keys.**

```bash
grep -rn "localStorage\|sessionStorage\|indexedDB\|document.cookie" src/
```

- `sessionStorage` in [`src/App.tsx`](src/App.tsx) holds the token, and only if you tick
  "Remember in this tab only". It is gone when the tab closes.
- `localStorage` in [`src/i18n/`](src/i18n/) holds the language choice — `ko` or `en`, nothing else.
- The remaining hits are the checkbox label in the translation files.

No IndexedDB, no cookies. **Message contents are never stored anywhere** — scan results live in memory
and disappear on reload.

**4. The browser enforces all of the above.** The policy is defined once in
[`vite.config.ts`](vite.config.ts) and applied to the built page two ways — as a `<meta http-equiv>`
tag inside `index.html`, and as a generated `_headers` file for hosts that turn it into real response
headers:

```
default-src 'none'; script-src 'self'; connect-src https://slack.com; ...
```

Because `connect-src` lists only `slack.com`, **a tampered build still could not send your token
anywhere else.** The browser refuses the connection. Check a live deployment either way:

```bash
# the meta tag, which every host preserves
curl -s https://minmboy.github.io/slack-cleaner/ | grep -o 'http-equiv="Content-Security-Policy"[^>]*'

# the response header, on hosts that can set one (GitHub Pages cannot, so this is empty there)
curl -sD - -o /dev/null https://minmboy.github.io/slack-cleaner/ | grep -i content-security-policy
```

**5. You can watch it at runtime.** Keep the DevTools Network tab open and confirm that nothing but
`slack.com/api/*` is ever requested.

> Building it yourself is the strongest option. If you use a deployed copy, **verify the URL** — a
> lookalike domain harvesting tokens is the obvious attack on a tool like this.

---

## Safety rails

- Only messages where `message.user` equals the `user_id` from `auth.test` are ever collected.
  `chat.delete` is the final authority on what may actually be removed.
- **Dry run** walks the whole queue and reports targets and ordering without deleting anything.
- The delete button stays disabled until you type the confirmation word.
- The token lives in memory, optionally in `sessionStorage`. **Revoke token** calls `auth.revoke`.
- `invalid_auth`, `token_revoked` and `missing_scope` abort the run; every other per-message failure is
  recorded and the run continues.

## Limits (know these)

- **Deletion cannot be undone.**
- If a workspace admin has disabled message deletion, calls fail with `cant_delete_message`.
  This tool records that rather than working around it.
- This is the same action as deleting in the Slack UI. Records **may survive in your company's export,
  Discovery, or retention backups.**
- **Attached files are not deleted.** That needs `files.delete` and the `files:write` scope.
- Setting a scan start date filters `conversations.history` by *root* timestamp, so replies you wrote
  inside a thread that started before the cutoff are not found. Leave the date empty for a complete
  sweep.
- You cannot delete anyone else's messages. Deleting your own thread root leaves other people's
  replies in place.

---

## Deployment

The output is static and there is no client-side router, so no rewrite rules are needed anywhere.
The build carries its own CSP in a meta tag, so the policy survives on hosts that cannot set headers.

**Cloudflare Pages / Netlify** — they pick up the generated `dist/_headers` automatically, so the
policy arrives as real response headers as well as the meta tag. This is the strongest option.

```
Build command:  npm run build
Build output:   dist
```

**GitHub Pages** — where this repository publishes, via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). Every push to `main` lints,
builds and deploys. In a fork, enable it once under Settings → Pages → Source → "GitHub Actions"; the
workflow is inert until then. It sets `BASE_PATH` from the repository name, because a project site is
served from `/<repo>/` rather than the domain root.

GitHub Pages cannot set response headers, so the CSP arrives only via the meta tag. That still enforces
`connect-src`, which is the directive that matters here — confirmed against the live deployment: a
request to `slack.com` succeeds and a request to any other host is refused. What you give up is
`frame-ancestors`, which is ignored inside a meta tag, plus the supplementary headers
(`Referrer-Policy`, `X-Content-Type-Options`, and so on).

**Vercel** — move the directives from `vite.config.ts` into `vercel.json` to get them as headers too.

For a one-time cleanup, not deploying at all and running `npm run dev` locally is the safest option.

---

## Layout

```
src/lib/slack.ts    CORS-shaped fetch, per-method rate limiting, 429 retry, cursor pagination
src/lib/api.ts      Typed wrappers: auth.test, conversations.list, users.list, users.info
src/lib/scan.ts     Walks history + replies, collects your own messages
src/lib/deleter.ts  Delete queue (replies before roots, newest first), per-failure classification
src/i18n/           Hand-rolled translations; ko.tsx defines the type every other language must match
src/App.tsx         Step state machine
vite.config.ts      The CSP, written once and emitted as both a meta tag and a _headers file
```

## License

[MIT](LICENSE)
