const db = require('../db');

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

function getBySlug(slug) {
  const row = db.prepare('SELECT * FROM businesses WHERE slug = ?').get(slug);
  return rowToBusiness(row);
}

function getById(id) {
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
  return rowToBusiness(row);
}

function findByAdminEmail(email) {
  const row = db.prepare('SELECT * FROM businesses WHERE admin_email = ?').get(email);
  return rowToBusiness(row);
}

function create({ slug, name, tagline, about, timezone, workingHours, slotMinutes, closedDays, cancellationFeeGBP, adminEmail, adminPasswordHash }) {
  const info = db.prepare(`
    INSERT INTO businesses (slug, name, tagline, about, timezone, working_hours_start, working_hours_end, slot_minutes, closed_days, cancellation_fee_gbp, admin_email, admin_password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug, name, tagline || '', about || '', timezone || 'Europe/London',
    workingHours.start, workingHours.end, slotMinutes, JSON.stringify(closedDays || [0]),
    cancellationFeeGBP || 0, adminEmail, adminPasswordHash
  );
  return getById(info.lastInsertRowid);
}

module.exports = { getBySlug, getById, findByAdminEmail, create };
