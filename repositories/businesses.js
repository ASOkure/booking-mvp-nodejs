const { pool } = require('../db');

function rowToBusiness(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    about: row.about,
    timezone: row.timezone,
    workingHours: { start: row.working_hours_start, end: row.working_hours_end },
    slotMinutes: row.slot_minutes,
    closedDays: JSON.parse(row.closed_days),
    cancellationFeeGBP: row.cancellation_fee_gbp,
    adminEmail: row.admin_email,
    adminPasswordHash: row.admin_password_hash,
    createdAt: row.created_at,
  };
}

async function getBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE slug = $1', [slug]);
  return rowToBusiness(rows[0]);
}

async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
  return rowToBusiness(rows[0]);
}

async function findByAdminEmail(email) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE admin_email = $1', [email]);
  return rowToBusiness(rows[0]);
}

async function create({ slug, name, tagline, about, timezone, workingHours, slotMinutes, closedDays, cancellationFeeGBP, adminEmail, adminPasswordHash }) {
  const { rows } = await pool.query(`
    INSERT INTO businesses (slug, name, tagline, about, timezone, working_hours_start, working_hours_end, slot_minutes, closed_days, cancellation_fee_gbp, admin_email, admin_password_hash)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [
    slug, name, tagline || '', about || '', timezone || 'Europe/London',
    workingHours.start, workingHours.end, slotMinutes, JSON.stringify(closedDays || [0]),
    cancellationFeeGBP || 0, adminEmail, adminPasswordHash,
  ]);
  return getById(rows[0].id);
}

module.exports = { getBySlug, getById, findByAdminEmail, create };
