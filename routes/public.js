const express = require('express');
const Stripe = require('stripe');
const businesses = require('../repositories/businesses');
const services = require('../repositories/services');
const bookings = require('../repositories/bookings');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

const router = express.Router({ mergeParams: true });

router.use(async (req, res, next) => {
  const business = await businesses.getBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: 'Unknown business' });
  req.business = business;
  next();
});

function generateDaySlots(business) {
  const slots = [];
  const [startH, startM] = business.workingHours.start.split(':').map(Number);
  const [endH, endM] = business.workingHours.end.split(':').map(Number);
  let cursor = startH * 60 + startM;
  const end = endH * 60 + endM;
  while (cursor + business.slotMinutes <= end) {
    const h = String(Math.floor(cursor / 60)).padStart(2, '0');
    const m = String(cursor % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    cursor += business.slotMinutes;
  }
  return slots;
}

router.get('/config', async (req, res) => {
  const { business } = req;
  res.json({
    name: business.name,
    tagline: business.tagline,
    about: business.about,
    timezone: business.timezone,
    workingHours: business.workingHours,
    slotMinutes: business.slotMinutes,
    closedDays: business.closedDays,
    cancellationFeeGBP: business.cancellationFeeGBP,
    services: await services.listForBusiness(business.id),
  });
});

router.get('/availability', async (req, res) => {
  const { business } = req;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

  const day = new Date(date + 'T00:00:00');
  if (business.closedDays.includes(day.getDay())) {
    return res.json({ date, slots: [] });
  }

  const allSlots = generateDaySlots(business);
  const taken = await bookings.takenTimesForDate(business.id, date);
  res.json({ date, slots: allSlots.filter(s => !taken.includes(s)) });
});

router.post('/bookings', async (req, res) => {
  const { business } = req;
  const { serviceId, date, time, name, email, phone, notes } = req.body;
  const service = await services.getByIdForBusiness(Number(serviceId), business.id);
  if (!service) return res.status(400).json({ error: 'Unknown service' });
  if (!date || !time || !name || !email || !phone) return res.status(400).json({ error: 'Missing required fields' });

  let booking;
  try {
    booking = await bookings.create({
      businessId: business.id,
      serviceId: service.id,
      date, time,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      notes,
      amountGBP: service.priceGBP,
    });
  } catch (err) {
    if (err instanceof bookings.SlotTakenError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }

  if (!stripe) {
    await bookings.setStatus(booking.id, 'confirmed');
    return res.json({ demoMode: true, bookingId: booking.id });
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
      success_url: `${PUBLIC_URL}/success.html?booking=${booking.id}&business=${business.slug}`,
      cancel_url: `${PUBLIC_URL}/${business.slug}?cancelled=1`,
      metadata: { bookingId: String(booking.id) },
    });
    await bookings.setStripeSessionId(booking.id, session.id);
    res.json({ checkoutUrl: session.url, bookingId: booking.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start payment. Please try again.' });
  }
});

module.exports = router;
