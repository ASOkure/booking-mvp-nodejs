const { zonedTimeToUtc } = require('./timezone');

function pad(n) {
  return String(n).padStart(2, '0');
}

// Formats a UTC Date as the "basic" ICS datetime format, e.g. 20260903T100000Z.
function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

// Escapes text per RFC 5545 (backslash, comma, semicolon, newline).
function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

function buildBookingIcs({ booking, service, business }) {
  const start = zonedTimeToUtc(booking.date, booking.time, business.timezone);
  const end = new Date(start.getTime() + service.durationMinutes * 60000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//booking-mvp//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@booking-mvp`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(`${service.name} — ${business.name}`)}`,
    `DESCRIPTION:${escapeIcsText(`${service.name} appointment with ${business.name}.`)}`,
    `LOCATION:${escapeIcsText(business.name)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

module.exports = { buildBookingIcs };
