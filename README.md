# Booking MVP

A multi-tenant booking and payment widget: each business gets its own booking
page at `/your-slug`, its own services/hours/fees, and its own admin login.
Pick a service, pick a date and time, pay with a card via Stripe Checkout, get
a confirmation.

Storage is SQLite via Node's built-in `node:sqlite` (no external database
server, no native module to compile) — requires **Node 22.5+** and the
`--experimental-sqlite` flag, which is already baked into `npm start`.

## Run it locally

```
npm install
cp .env.example .env
```

Generate real values for `JWT_SECRET` and `PLATFORM_ADMIN_KEY` in `.env`:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If you have an existing `data.json` from before this became multi-tenant,
migrate it into a real business:

```
npm run migrate-legacy-data -- --email owner@example.com --password 'a-real-password'
```

This prints a slug — put it in `.env` as `DEFAULT_BUSINESS_SLUG` so `/` keeps
redirecting somewhere sensible. Otherwise, create your first business directly:

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

There's no self-serve signup yet — create each one via the `POST
/api/platform/businesses` endpoint shown above (protected by
`PLATFORM_ADMIN_KEY`, not linked from any UI). Editing a business's
services/hours after creation has no UI either yet; re-run the endpoint or
edit `data/booking.db` directly.

## Deploying so you can send a real link

Any Node 22.5+ host works.

**Render**
1. Push this folder to a GitHub repo
2. New Web Service on https://render.com, connect the repo
3. Build command: `npm install`  ·  Start command: `npm start`
4. Add the environment variables from `.env.example` in the dashboard
5. Set `PUBLIC_URL` to the `https://your-app.onrender.com` URL Render gives you

Note: `data/booking.db` (SQLite) resets on redeploy on most free tiers — fine
for demos, but for real clients' data move to a persistent Postgres database
before they start taking live bookings.

## Viewing bookings

Log in at `/admin.html` with a business's admin email/password (set when that
business was created). The API underneath is `POST /api/admin/login` then
`GET /api/admin/bookings` with the returned JWT as a `Bearer` token.
