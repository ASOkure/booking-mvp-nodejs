const { pool } = require('../db');

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

async function listForBusiness(businessId) {
  const { rows } = await pool.query('SELECT * FROM services WHERE business_id = $1 ORDER BY id', [businessId]);
  return rows.map(rowToService);
}

async function getByIdForBusiness(id, businessId) {
  const { rows } = await pool.query('SELECT * FROM services WHERE id = $1 AND business_id = $2', [id, businessId]);
  return rowToService(rows[0]);
}

async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM services WHERE id = $1', [id]);
  return rowToService(rows[0]);
}

async function create(businessId, { name, durationMinutes, priceGBP, description }) {
  const { rows } = await pool.query(`
    INSERT INTO services (business_id, name, duration_minutes, price_gbp, description)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [businessId, name, durationMinutes, priceGBP, description || '']);
  return getByIdForBusiness(rows[0].id, businessId);
}

module.exports = { listForBusiness, getByIdForBusiness, getById, create };
