const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set (see .env.example)');
}

// Render's managed Postgres requires SSL; a local dev/test instance
// (e.g. via Docker) typically doesn't have a cert to verify.
const useSSL = !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL DEFAULT '',
      about TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'Europe/London',
      working_hours_start TEXT NOT NULL DEFAULT '08:00',
      working_hours_end TEXT NOT NULL DEFAULT '17:00',
      slot_minutes INTEGER NOT NULL DEFAULT 60,
      closed_days TEXT NOT NULL DEFAULT '[0]',
      cancellation_fee_gbp INTEGER NOT NULL DEFAULT 0,
      admin_email TEXT NOT NULL UNIQUE,
      admin_password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_gbp INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      amount_gbp INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_session_id TEXT,
      cancellation_fee_gbp INTEGER,
      cancelled_at TIMESTAMPTZ,
      reminder_24h_sent_at TIMESTAMPTZ,
      reminder_1h_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_biz_slot
      ON bookings(business_id, date, time)
      WHERE status <> 'cancelled';
  `);

  // CREATE TABLE IF NOT EXISTS above won't add new columns to a table that
  // already exists on a live database — these cover that migration.
  await pool.query(`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ;
  `);
}

module.exports = { pool, initSchema };
