# Deploying

## The one thing you need to know first

**Netlify cannot run this FastAPI backend.** Netlify Functions support
JavaScript/TypeScript and Go — there is no Python runtime. That is a platform
limitation, not something a config file can work around.

So the project splits in two, which is the normal shape for this stack anyway:

| Piece | Goes to | Cost |
|---|---|---|
| `frontend/` — HTML, CSS, Bootstrap, JS | **Netlify** ✅ | Free |
| `backend/` — FastAPI (Python) | **Render** (or Railway / Fly.io) | Free tier |
| Database — Postgres | **Neon** (or Netlify DB) | Free tier |

You still get to use Netlify, exactly as you wanted — it serves the site your
customers see. The Python API just lives on a host that runs Python.

---

## Step 1 · Database (Postgres)

**Option A — Neon directly (recommended, free)**

1. Sign up at <https://neon.tech> and create a project.
2. Copy the connection string. It looks like:
   `postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`
3. Keep it for Step 2.

**Option B — Netlify DB**

Netlify DB is managed Postgres (the same engine). Note from Netlify's docs:
it is **available on credit-based plans only**, so on a free Netlify plan use
Option A. If you are on a credit-based plan, provision it from your site's
dashboard and copy the `NETLIFY_DATABASE_URL` value.

Either way you end up with a standard Postgres URL, which is all the backend needs.

---

## Step 2 · Backend on Render (free)

1. Push this repo to GitHub.
2. On <https://render.com> → **New → Blueprint** → pick the repo.
3. Render reads `render.yaml` from the repo root (it is not read from a subdirectory). Confirm:
   - Root directory: `backend`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set these environment variables in the Render dashboard:

   ```
   DATABASE_URL      = <your Postgres URL from Step 1>
   ADMIN_USERNAME    = <pick one>
   ADMIN_PASSWORD    = <pick a strong one>
   SECRET_KEY        = <long random string>
   CORS_ORIGINS      = https://your-site.netlify.app
   VAPID_PUBLIC_KEY  = <from Step 3>
   VAPID_PRIVATE_KEY = <from Step 3>
   VAPID_SUBJECT     = mailto:you@example.com
   ```

5. Deploy. Check `https://your-api.onrender.com/health` returns `{"status":"ok"}`.

The database tables are created and seeded automatically on first boot.

> Render's free tier sleeps after ~15 minutes idle; the first request then takes
> ~30s to wake. Fine for a small store — upgrade to keep it always-on.

**Any Docker host works too** — `backend/Dockerfile` is ready for Fly.io,
Railway, Koyeb, or your own VPS.

---

## Step 3 · Generate push-notification keys

Run once, locally:

```bash
cd backend && ./.venv/bin/python -m app.vapid_keys
```

It prints `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Put both into Render's
environment variables. Without them the store still works — you just get no
push notifications.

---

## Step 4 · Frontend on Netlify

1. Edit `frontend/assets/js/config.js` and set your backend URL:

   ```js
   window.APP_CONFIG = {
     API_BASE: 'https://your-api.onrender.com',
   };
   ```

2. Deploy. Either drag-and-drop the `frontend/` folder onto
   <https://app.netlify.com/drop>, or connect the repo with:
   - **Base directory:** `frontend`
   - **Publish directory:** `.`  (relative to the base directory — `frontend/frontend` would 404)
   - **Build command:** *(leave empty — it is plain static files)*

3. Open `https://your-site.netlify.app`. Then go to `/admin.html` and sign in.

---

## Step 5 · Turn on Chrome notifications

1. Open the dashboard on **HTTPS** (Netlify gives you this automatically).
2. **Notifications** tab → **Enable notifications** → allow the Chrome prompt.
3. Hit **Send test notification** to confirm.

From then on, every customer order pushes an alert to your machine — even with
the tab closed, as long as Chrome is running.

Notifications require HTTPS. They will not work over plain `http://` on a
custom domain (`localhost` is exempt, for development).

---

## Required environment variables

The backend now **refuses to start** in production unless these are set — it
used to boot with `admin` / `admin123` on a public URL, which was a full
takeover of the dashboard and every customer's details.

| Variable | Required | Notes |
|---|---|---|
| `ENVIRONMENT` | yes | `production`. Anything else re-enables the insecure defaults. |
| `SECRET_KEY` | yes | 32+ chars. Render's `generateValue: true` handles it. |
| `ADMIN_USERNAME` | yes | Must not be empty. |
| `ADMIN_PASSWORD` | yes | Not `admin123`/`admin`/`password`, not empty. |
| `DATABASE_URL` | yes | Must be Postgres — SQLite on Render/Fly is wiped on every redeploy. |
| `CORS_ORIGINS` | recommended | Your Netlify URL. `*` is the default. |
| `VAPID_*` | for push | Generate with `./.venv/bin/python -m app.vapid_keys`. |

If any are missing the container exits with a message naming exactly which — a
loud failure rather than a silent insecure boot.

## Checklist

- [ ] Postgres created, connection string copied
- [ ] Backend deployed, `/health` returns ok
- [ ] `CORS_ORIGINS` set to the Netlify URL (not `*`) once live
- [ ] `ADMIN_PASSWORD` changed from the default
- [ ] VAPID keys set
- [ ] `API_BASE` in `config.js` points at the backend
- [ ] Frontend deployed to Netlify
- [ ] Notifications enabled and tested
- [ ] Placed a test order end-to-end and confirmed it in the dashboard
- [ ] Registered a test customer account and checked the order history
