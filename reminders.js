const Twilio = require('twilio');
const bookings = require('./repositories/bookings');
const { zonedTimeToUtc } = require('./timezone');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
const client = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

async function sendSms(to, message) {
  if (!client) {
    console.log(`[reminders] Twilio not configured — would send to ${to}: "${message}"`);
    return;
  }
  try {
    await client.messages.create({ to, from: TWILIO_FROM_NUMBER, body: message });
  } catch (err) {
    console.error(`[reminders] Failed to send SMS to ${to}:`, err.message);
  }
}

async function checkAndSendReminders() {
  let candidates;
  try {
    candidates = await bookings.findConfirmedUpcomingForReminders();
  } catch (err) {
    console.error('[reminders] Failed to query upcoming bookings:', err.message);
    return;
  }

  const now = Date.now();

  for (const booking of candidates) {
    if (!booking.customerPhone) continue; // legacy bookings made before phone was required

    const appointmentUtcMs = zonedTimeToUtc(booking.date, booking.time, booking.businessTimezone || 'Europe/London').getTime();
    const msUntil = appointmentUtcMs - now;
    const timeLabel = booking.time.slice(0, 5);

    // 20-24h window (not a flat "<=24h") so a booking made only a few hours
    // in advance never gets a misleading "tomorrow" message — it just skips
    // straight to the 1h reminder instead.
    if (!booking.reminder24hSentAt && msUntil <= 24 * HOUR_MS && msUntil > 20 * HOUR_MS) {
      await sendSms(
        booking.customerPhone,
        `Reminder: your ${booking.serviceName} appointment with ${booking.businessName} is tomorrow at ${timeLabel}.`
      );
      await bookings.markReminder24hSent(booking.id);
    }

    if (!booking.reminder1hSentAt && msUntil <= HOUR_MS && msUntil > 0) {
      await sendSms(
        booking.customerPhone,
        `Reminder: your ${booking.serviceName} appointment with ${booking.businessName} is coming up today at ${timeLabel}.`
      );
      await bookings.markReminder1hSent(booking.id);
    }
  }
}

function startReminderScheduler() {
  checkAndSendReminders().catch(err => console.error('[reminders] Unexpected error:', err));
  setInterval(() => {
    checkAndSendReminders().catch(err => console.error('[reminders] Unexpected error:', err));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startReminderScheduler, checkAndSendReminders };
