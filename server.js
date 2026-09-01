const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');
require('dotenv').config();
console.log('Stripe key loaded:', process.env.STRIPE_SECRET_KEY ? 'YES (' + process.env.STRIPE_SECRET_KEY.slice(0, 12) + '...)' : 'NO');

const app = express();
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

// ---- Business configuration (edit this block per client/trade) ----
const BUSINESS = {
  name: process.env.BUSINESS_NAME || 'Aster & Co.',
  tagline: process.env.BUSINESS_TAGLINE || 'Local, reliable, booked in minutes.',
  about: process.env.BUSINESS_ABOUT ||
    'We have been serving Cambourne and the surrounding villages for years. Every visit is confirmed instantly and paid securely online, no more chasing texts back and forth.',
  timezone: 'Europe/London',
  workingHours: { start: '08:00', end: '17:00' },
  slotMinutes: 60,
  closedDays: [0], // 0 = Sunday
  cancellationFeeGBP: Number(process.env.CANCELLATION_FEE_GBP || 0),
  services: [
    { id: 'standard-clean', name: 'Standard Clean', durationMinutes: 60, priceGBP: 35, description: 'A thorough clean of kitchen, bathroom, and living areas.' },
    { id: 'deep-clean', name: 'Deep Clean', durationMinutes: 120, priceGBP: 75, description: 'Top-to-bottom clean including skirting boards, appliances, and windowsills.' },
    { id: 'end-of-tenancy', name: 'End of Tenancy', durationMinutes: 180, priceGBP: 120, description: 'Full move-out clean designed to help secure your deposit back.' },
  ],
};
// ---------------------------------------------------------------------

// ---- Simple JSON file "database" — no native compilation required ----
const DB_FILE = path.join(__dirname, 'data.json');

function loadBookings() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveBookings(bookings) {
  fs.writeFileSync(DB_FILE, JSON.stringify(bookings, null, 2));
}

let bookings = loadBookings();
let nextId = bookings.reduce((max, b) => Math.max(max, b.id), 0) + 1;
// ------------------------------------------------------------------

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Stripe webhook needs the raw body, so it must be registered before express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(200).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const booking = bookings.find(b => b.stripe_session_id === session.id);
    if (booking) {
      booking.status = 'confirmed';
      saveBookings(bookings);
    }
  }
  res.json({ received: true });
});

app.use(express.json());

app.get('/api/config', (req, res) => {
  res.json(BUSINESS);
});

function generateDaySlots() {
  const slots = [];
  const [startH, startM] = BUSINESS.workingHours.start.split(':').map(Number);
  const [endH, endM] = BUSINESS.workingHours.end.split(':').map(Number);
  let cursor = startH * 60 + startM;
  const end = endH * 60 + endM;
  while (cursor + BUSINESS.slotMinutes <= end) {
    const h = String(Math.floor(cursor / 60)).padStart(2, '0');
    const m = String(cursor % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    cursor += BUSINESS.slotMinutes;
  }
  return slots;
}

app.get('/api/availability', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
  const day = new Date(date + 'T00:00:00');
  if (BUSINESS.closedDays.includes(day.getDay())) {
    return res.json({ date, slots: [] });
  }
  const allSlots = generateDaySlots();
  const taken = bookings
    .filter(b => b.date === date && b.status !== 'cancelled')
    .map(b => b.time);
  const slots = allSlots.filter(s => !taken.includes(s));
  res.json({ date, slots });
});

app.post('/api/bookings', async (req, res) => {
  const { serviceId, date, time, name, email, phone, notes } = req.body;
  const service = BUSINESS.services.find(s => s.id === serviceId);
  if (!service) return res.status(400).json({ error: 'Unknown service' });
  if (!date || !time || !name || !email) return res.status(400).json({ error: 'Missing required fields' });

  const existing = bookings.find(
    b => b.date === date && b.time === time && b.status !== 'cancelled'
  );
  if (existing) return res.status(409).json({ error: 'That slot was just taken. Please pick another.' });

  const bookingId = nextId++;
  const booking = {
    id: bookingId,
    service_id: serviceId,
    date, time,
    customer_name: name,
    customer_email: email,
    customer_phone: phone || '',
    notes: notes || '',
    amount_gbp: service.priceGBP,
    status: 'pending',
    stripe_session_id: null,
    created_at: new Date().toISOString(),
  };
  bookings.push(booking);
  saveBookings(bookings);

  if (!stripe) {
    // Demo mode without Stripe keys configured: mark confirmed immediately.
    booking.status = 'confirmed';
    saveBookings(bookings);
    return res.json({ demoMode: true, bookingId });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: service.priceGBP * 100,
          product_data: { name: `${service.name} — ${date} ${time}` },
        },
        quantity: 1,
      }],
      success_url: `${PUBLIC_URL}/success.html?booking=${bookingId}`,
      cancel_url: `${PUBLIC_URL}/index.html?cancelled=1`,
      metadata: { bookingId: String(bookingId) },
    });
    booking.stripe_session_id = session.id;
    saveBookings(bookings);
    res.json({ checkoutUrl: session.url, bookingId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start payment. Please try again.' });
  }
});

app.get('/api/bookings/:id', (req, res) => {
  const booking = bookings.find(b => b.id === Number(req.params.id));
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
});

// Simple admin view, protected by a shared token in the query string.
function checkAdminToken(req, res) {
  if (req.query.token !== (process.env.ADMIN_TOKEN || 'changeme')) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/api/admin/bookings', (req, res) => {
  if (!checkAdminToken(req, res)) return;
  const sorted = [...bookings].sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  res.json(sorted);
});

app.post('/api/admin/bookings/:id/cancel', (req, res) => {
  if (!checkAdminToken(req, res)) return;
  const booking = bookings.find(b => b.id === Number(req.params.id));
  if (!booking) return res.status(404).json({ error: 'Not found' });
  if (booking.status === 'cancelled') return res.status(409).json({ error: 'Booking is already cancelled' });

  booking.status = 'cancelled';
  booking.cancellation_fee_gbp = BUSINESS.cancellationFeeGBP > 0 ? BUSINESS.cancellationFeeGBP : 0;
  booking.cancelled_at = new Date().toISOString();
  saveBookings(bookings);
  res.json(booking);
});

app.listen(PORT, () => {
  console.log(`Booking MVP running at http://localhost:${PORT}`);
});
