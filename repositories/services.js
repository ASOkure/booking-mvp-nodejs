const db = require('../db');

function rowToService(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    priceGBP: row.price_gbp,
    description: row.description,
  };
}

function listForBusiness(businessId) {
  return db.prepare('SELECT * FROM services WHERE business_id = ? ORDER BY id').all(businessId).map(rowToService);
}

function getByIdForBusiness(id, businessId) {
  const row = db.prepare('SELECT * FROM services WHERE id = ? AND business_id = ?').get(id, businessId);
  return rowToService(row);
}

function getById(id) {
  const row = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  return rowToService(row);
}

function create(businessId, { name, durationMinutes, priceGBP, description }) {
  const info = db.prepare(`
    INSERT INTO services (business_id, name, duration_minutes, price_gbp, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(businessId, name, durationMinutes, priceGBP, description || '');
  return getByIdForBusiness(info.lastInsertRowid, businessId);
}

module.exports = { listForBusiness, getByIdForBusiness, getById, create };
