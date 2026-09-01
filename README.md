# Booking MVP

A lightweight booking and payment widget: pick a service, pick a date and time,
pay with a card via Stripe Checkout, get a confirmation. Built to be re-skinned
for any local service business (cleaner, mobile hairdresser, personal trainer,
tutor, etc.) by editing the `BUSINESS` block in `server.js` or the environment
variables — no design changes needed.

## Run it locally

```
npm install
cp .env.example .env
npm start
```

Open http://localhost:3000. Without Stripe keys set, bookings auto-confirm
in "demo mode" so you can show the full flow with no real payment.

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

## Re-branding for a specific client

Edit the `BUSINESS` object at the top of `server.js` (name, tagline, about text,
services, prices, working hours) — or set the equivalent environment variables
for the parts that are already wired up (`BUSINESS_NAME`, `BUSINESS_TAGLINE`,
`BUSINESS_ABOUT`). No other files need to change for a basic re-skin.

## Deploying so you can send a real link

Any Node host works. Two easy free-tier options:

**Render**
1. Push this folder to a GitHub repo
2. New Web Service on https://render.com, connect the repo
3. Build command: `npm install`  ·  Start command: `npm start`
4. Add the environment variables from `.env.example` in the dashboard
5. Set `PUBLIC_URL` to the `https://your-app.onrender.com` URL Render gives you

**Railway**
1. https://railway.app → New Project → Deploy from GitHub repo
2. Add the same environment variables
3. Set `PUBLIC_URL` to the generated domain

Note: `data.db` (SQLite) resets on redeploy on most free tiers — fine for demos,
but for a real client move to a persistent Postgres database before they start
taking live bookings.

## Viewing bookings

`GET /api/admin/bookings?token=YOUR_ADMIN_TOKEN` returns all bookings as JSON.
This is intentionally minimal — enough to prove the concept in a client
conversation, not a full admin dashboard.
