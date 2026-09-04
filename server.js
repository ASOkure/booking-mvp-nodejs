const express = require('express');
const cors = require('cors');
const path = require('path');
const Stripe = require('stripe');
require('dotenv').config({ quiet: true });

const { initSchema } = require('./db');
const bookings = require('./repositories/bookings');
const services = require('./repositories/services');
const { startReminderScheduler } = require('./reminders');
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const platformRouter = require('./routes/platform');

const app = express();
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const DEFAULT_BUSINESS_SLUG = process.env.DEFAULT_BUSINESS_SLUG || '';
const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

app.use(cors());

// Redirect the bare root to the default business, before static's own
// automatic "/" -> index.html resolution ever gets a chance to run.
app.get('/', (req, res) => {
  if (DEFAULT_BUSINESS_SLUG) return res.redirect(`/${DEFAULT_BUSINESS_SLUG}`);
  res.status(404).send('No default business configured.');
});

app.use(express.static(path.join(__dirname, 'public')));

// Stripe webhook needs the raw body, so it must be registered before express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(200).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    await bookings.confirmByStripeSessionId(event.data.object.id);
  } else if (event.type === 'checkout.session.expired') {
    await bookings.expireByStripeSessionId(event.data.object.id);
  }
  res.json({ received: true });
});

app.use(express.json());

app.use('/api/business/:slug', publicRouter);
app.use('/api/admin', adminRouter);
app.use('/api/platform', platformRouter);

app.get('/api/bookings/:id', async (req, res) => {
  const booking = await bookings.findById(Number(req.params.id));
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const service = await services.getById(booking.serviceId);
  res.json({ ...booking, serviceName: service ? service.name : null });
});

// Any other single-segment path is treated as a business slug and served
// the booking widget, which resolves the slug itself from the URL.
app.get('/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Booking MVP running at http://localhost:${PORT}`);
    });
    startReminderScheduler();
  })
  .catch(err => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
