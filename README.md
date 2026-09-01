# Booking MVP

A multi-tenant booking and payment widget: each business gets its own booking
page at `/your-slug`, its own services/hours/fees, and its own admin login.
Pick a service, pick a date and time, pay with a card via Stripe Checkout, get
a confirmation.

Storage is Postgres via the standard `pg` driver — real persistence, not tied
to the app instance's local disk (Render's free-tier disk is ephemeral and
resets on any restart, including an env-var change with no code deploy at
all — Postgres avoids that entirely).

## Run it locally

```
npm install
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to a Postgres instance — a local one via Docker
is easiest:

```
docker run -d --name booking-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=booking -p 5432:5432 postgres:16-alpine
```

then `DATABASE_URL=postgresql://postgres:devpass@localhost:5432/booking`.

Generate real values for `JWT_SECRET` and `PLATFORM_ADMIN_KEY`:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Create your first business either via the `/platform.html` form (once the
server is running, see below) or directly:

```
curl -X POST http://localhost:3000/api/platform/businesses \
  -H "Content-Type: application/json" \
  -H "X-Platform-Key: $PLATFORM_ADMIN_KEY" \
  -d '{
    "slug": "aster-co", "name": "Aster & Co.",
    "workingHours": {"start": "08:00", "end": "17:00"}, "slotMinutes": 60,
    "adminEmail": "owner@example.com", "adminPassword": "a-real-password",
    "services": [{"name": "Standard Clean", "durationMinutes": 60, "priceGBP": 35}]
  }'
```

Put the slug it returns into `.env` as `DEFAULT_BUSINESS_SLUG` so `/` keeps
redirecting somewhere sensible. If you have an existing `data.json` from
before this became multi-tenant, `migrate-legacy-data.js` imports it into a
real business instead (see the script's header comment for usage).

Then:

```
npm start
```

Open http://localhost:3000/aster-co (or whichever slug you created). Without
Stripe keys set, bookings auto-confirm in "demo mode" so you can show the full
flow with no real payment.

## Turning on real Stripe payments

1. Create a free Stripe account at https://dashboard.stripe.com/register
2. Get your test secret key from https://dashboard.stripe.com/test/apikeys
   and put it in `.env` as `STRIPE_SECRET_KEY`
3. For the webhook (confirms payment after checkout):
   - Locally: install the Stripe CLI, run `stripe listen --forward-to localhost:3000/api/webhook`,
     and copy the signing secret it prints into `STRIPE_WEBHOOK_SECRET`
   - In production: add a webhook endpoint in the Stripe dashboard pointing to
     `https://yourdomain.com/api/webhook`, listening for `checkout.session.completed`,
     and copy its signing secret into `STRIPE_WEBHOOK_SECRET`
4. Switch to live keys once you are ready to take real payments.

## Adding a new business

Visit `/platform.html` — a form for the platform key, business details, admin
login, and services, wrapping `POST /api/platform/businesses` (protected by
`PLATFORM_ADMIN_KEY`, not linked from any other page — there's no self-serve
signup yet). Editing a business's services/hours after creation has no UI
either yet; re-run the form/endpoint or edit the database directly.

## Deploying so you can send a real link

**Render**
1. Push this folder to a GitHub repo
2. Add a Postgres instance on Render (New → PostgreSQL), copy its "Internal
   Database URL"
3. New Web Service, connect the repo
4. Build command: `npm install`  ·  Start command: `npm start`
5. Env vars: `DATABASE_URL` (from step 2), `JWT_SECRET`, `PLATFORM_ADMIN_KEY`,
   `PUBLIC_URL` (the `https://your-app.onrender.com` URL Render gives you),
   `DEFAULT_BUSINESS_SLUG` (set after creating your first business)

## Viewing bookings

Log in at `/admin.html` with a business's admin email/password (set when that
business was created). The API underneath is `POST /api/admin/login` then
`GET /api/admin/bookings` with the returned JWT as a `Bearer` token.
