# Zak Store — متجر زاك

A bilingual (Arabic / English) digital-goods storefront: game top-ups, apps and
subscriptions. Customers pick a package, pay by account transfer or QR, and
submit their receipt. Every order lands in an admin dashboard and fires a Chrome
push notification to the owner.

**Every value on the storefront is controlled from the dashboard** — products,
packages, prices, payment details, all copy in both languages, colours, and the
notification text. Nothing is hard-coded in the HTML.

```
├── backend/          FastAPI + SQLAlchemy  (Python)
│   ├── app/
│   │   ├── main.py        entrypoint, CORS, static mount
│   │   ├── models.py      catalogue, orders, settings, push subscriptions
│   │   ├── routers/       public.py (storefront) · admin.py (dashboard)
│   │   ├── push.py        Web Push delivery
│   │   └── vapid_keys.py  key generator
│   ├── Dockerfile · render.yaml · Procfile
│   └── requirements.txt
└── frontend/         HTML + CSS + Bootstrap 5 + vanilla JS
    ├── index.html         storefront
    ├── product.html       checkout flow
    ├── account.html       customer sign-in + order history
    ├── order.html         order details (customer and admin views)
    ├── admin.html         dashboard
    ├── sw.js              service worker (push)
    └── assets/
```

---

## Run it locally

```bash
cd backend && ./run.sh
```

That creates a virtualenv, installs dependencies, copies `.env.example` to
`.env`, and starts the server with SQLite. Then open:

| URL | What |
|---|---|
| <http://localhost:8000> | Storefront |
| <http://localhost:8000/admin.html> | Dashboard — `admin` / `admin123` |
| <http://localhost:8000/docs> | Interactive API docs |

The database is seeded on first boot with four products (PUBG Mobile, Free Fire,
CapCut Pro, Netflix), three categories, and two payment methods.

> The backend serves `frontend/` automatically when both folders sit side by
> side, so there is nothing separate to start in development.

### Push notifications locally

```bash
cd backend
./.venv/bin/python -m app.vapid_keys   # prints two keys
```

Paste them into `backend/.env`, restart, then enable notifications from the
dashboard's **Notifications** tab. `localhost` counts as a secure origin, so
this works without HTTPS in development.

---

## How the bilingual layer works

- **Static UI text** lives in `frontend/assets/js/i18n.js` (`DICT.ar` / `DICT.en`).
- **Dynamic content** carries both languages in the database — every table has
  `*_ar` and `*_en` columns, and `I18N.pick(obj, 'name')` selects the right one.
- Switching language flips `<html dir>`, swaps Bootstrap's LTR/RTL stylesheet,
  and re-renders. The custom CSS uses logical properties
  (`margin-inline-start`, `inset-inline-start`), so RTL needs no separate rules.
- Prices use Latin digits in both languages — the convention on Arabic
  storefronts, and it keeps figures readable either way.

---

## API

Public — no auth:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bootstrap` | Settings + categories + products + payment methods, one call |
| `GET` | `/api/products/{slug}` | One product with its packages |
| `POST` | `/api/orders` | Place an order (triggers the push notification) |
| `GET` | `/api/push/public-key` | VAPID public key |

Customer accounts — `Authorization: Bearer <token>` from `POST /api/customer/login`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/customer/register`, `/api/customer/login` | Create / open a session |
| `GET` `PUT` | `/api/customer/me` | Profile |
| `GET` | `/api/customer/orders` | Own order history (paginated) |
| `GET` | `/api/customer/orders/{id}` | One own order |

Admin — `Authorization: Bearer <token>` from `POST /api/auth/login`:

| Method | Path |
|---|---|
| `GET` `PUT` | `/api/admin/settings` |
| `GET` `POST` `PUT` `DELETE` | `/api/admin/products`, `/categories`, `/payment-methods` |
| `POST` `PUT` `DELETE` | `/api/admin/products/{id}/packages`, `/api/admin/packages/{id}` |
| `GET` `PATCH` `DELETE` | `/api/admin/orders` (paginated), `/api/admin/orders/{id}` |
| `GET` | `/api/admin/orders/{id}/locate` — which page an order is on |
| `GET` `POST` `DELETE` | `/api/admin/notifications` |
| `GET` | `/api/admin/stats` |
| `POST` | `/api/admin/push/subscribe`, `/push/test`, `/push/unsubscribe` |

Full interactive docs at `/docs`.

---

## Configuration

All via environment variables — see `backend/.env.example`.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | SQLite locally; Postgres in production. `postgres://` URLs are normalised automatically. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Dashboard login. **Change these.** |
| `SECRET_KEY` | Signs the JWT session tokens. |
| `CORS_ORIGINS` | Comma-separated. Set to your Netlify URL in production, not `*`. |
| `VAPID_*` | Web Push keys. Push is skipped cleanly if unset. |

---

## Product artwork

The four seeded products ship with custom SVG artwork in
`frontend/assets/img/`. It is self-contained, so nothing depends on an external
image host staying up.

To use official game or app artwork instead, paste a URL into **Image URL** on
the product in the dashboard. Publisher logos are trademarks — using them to
identify what you are selling is normal for a top-up store, but the choice (and
the licensing) is yours to make.

## Deploying

See **[DEPLOY.md](DEPLOY.md)**.

Short version: the frontend goes to Netlify, the FastAPI backend goes to Render
(or any Docker host), and Postgres comes from Neon. **Netlify cannot host the
Python backend** — Netlify Functions run JavaScript/TypeScript and Go only.

---

## Accounts and order tracking

Customers can check out as a guest (name + email required) or create an account.
An account gets them `account.html`: their order history with live status, and a
details page per order.

Two token scopes share one signing key but never cross over — a customer token
is rejected by admin routes with `403`, and one customer cannot read another's
order (`404`, deliberately indistinguishable from a missing one). Passwords use
`hashlib.scrypt` from the standard library, so there is no native build step to
break a deploy.

Registering with an email that already has guest orders adopts them into the new
account automatically.

## Notifications

Every order writes a row to the `notifications` table **synchronously**, so the
dashboard bell has a complete history even if the browser push fails or no
device is subscribed. Web Push is best-effort on top of that.

The dashboard learns about new orders three ways: the service worker messages
any open tab the instant a push lands, a 15-second poll runs while the tab is
visible, and a refresh fires when the tab regains focus.

Clicking a notification — in the bell or in the OS — deep-links to
`admin.html#order-<id>`, which resolves the order's page via
`/api/admin/orders/{id}/locate`, clears any filter hiding it, and highlights the
row. It works when the order is not on the first page.

## Email notifications

Every order can email you. SMTP credentials go in environment variables
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`); the
recipient address, subject template and on/off switch live in the dashboard, so
the password never travels through the settings API.

Free options, all comfortably large enough for a store this size:

| Provider | Host | Free tier | Note |
|---|---|---|---|
| Gmail | `smtp.gmail.com:587` | ~500/day | Needs an **App password** (Google Account → Security → 2-Step Verification → App passwords), *not* your normal password |
| Brevo | `smtp-relay.brevo.com:587` | 300/day | |
| Resend | `smtp.resend.com:587` | 3,000/month | Username is literally `resend`, password is the API key |

Delivery runs in the same background task as the web push, after the response is
sent — a mail server being down can never fail a customer's order.

## Notification sound

Two separate things, and only one of them is under this app's control:

- **In-page chime** — when the dashboard is open, a new order plays a short
  two-tone chime synthesised with the Web Audio API (no audio file to ship).
  Toggle it in the Notifications tab.
- **Desktop push sound** — chosen by the operating system. The Notification
  API's `sound` property was never implemented in Chrome, so no web page can set
  it. On macOS: **System Settings → Notifications → Google Chrome**, set the
  alert style to Banners or Alerts and enable "Play sound for notifications",
  and check that Focus / Do Not Disturb is off.

## Product images

Products ship with the publishers' official app-store artwork, downloaded into
`frontend/assets/img/` so nothing depends on a third-party CDN staying up. The
generated SVG placeholders are kept alongside them as fallbacks.

To change an image, edit the product in the dashboard: paste a URL, or use
**Upload image** to pick a file (PNG/JPG/WebP/SVG up to 1.5 MB). Uploads are
stored inline with the product as a data URI, because Render and Fly have
ephemeral filesystems with nowhere to persist an uploaded file between deploys.

These logos are trademarks of their publishers. Using them to identify the
product you are selling top-ups for is normal for this kind of store, but the
licensing call is yours.

## A note on class names

Custom component classes are prefixed `zs-` (`zs-card`, `zs-dialog`,
`zs-toast`, `zs-nav`). This is not decoration: Bootstrap defines `.card`,
`.modal`, `.toast`, `.badge` and `.nav` as components, and `.modal{display:none}`
plus `.toast:not(.show){display:none}` silently hide anything reusing those
names. Keep the prefix when adding components.

## Schema changes

`init_db()` runs `create_all()` and then `ensure_schema()`, which adds columns
present in the models but missing from the database. `create_all` only creates
missing *tables* — it never alters an existing one, so without this, adding a
field breaks every query against an older database. It handles additive changes
only; anything destructive wants a real migration tool.

## Security notes

Worth knowing before real customers use this:

- Orders are trusted as submitted. The receipt number is not verified against
  any payment provider — you confirm each order manually from the dashboard.
  That matches how the reference site works, but it means a customer can submit
  a fake receipt; always check before marking an order **Paid**.
- There is a single admin account from environment variables, not a user table.
  Fine for one owner; add real accounts if you need staff logins.
- The app refuses to boot in production with default/empty credentials, a short
  `SECRET_KEY`, or a SQLite `DATABASE_URL`. Set `ENVIRONMENT=development` to
  work locally.
- There is no rate limiting on login or checkout. Put Cloudflare or similar in
  front before you advertise the URL widely.
- Customer registration has no email verification — an address can be claimed
  without proving ownership, which also claims any guest orders placed with it.
  Add verification before it gates anything valuable.
- Emails are canonicalised with NFKC + casefold before the uniqueness check, so
  Unicode lookalikes (e.g. U+212A KELVIN SIGN for "k") cannot be used to squat
  an address.
- There is no rate limit on `POST /api/orders`. Consider adding one if the store
  gets public traffic.
