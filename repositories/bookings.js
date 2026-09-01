const { pool } = require('../db');

class SlotTakenError extends Error {}
class AlreadyCancelledError extends Error {}

function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    serviceId: row.service_id,
    date: row.date,
    time: row.time,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notes: row.notes,
    amountGBP: row.amount_gbp,
    status: row.status,
    stripeSessionId: row.stripe_session_id,
    cancellationFeeGBP: row.cancellation_fee_gbp,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}

async function takenTimesForDate(businessId, date) {
  const { rows } = await pool.query(`
    SELECT time FROM bookings WHERE business_id = $1 AND date = $2 AND status <> 'cancelled'
  `, [businessId, date]);
  return rows.map(r => r.time);
}

async function create({ businessId, serviceId, date, time, customerName, customerEmail, customerPhone, notes, amountGBP }) {
  try {
    const { rows } = await pool.query(`
      INSERT INTO bookings (business_id, service_id, date, time, customer_name, customer_email, customer_phone, notes, amount_gbp, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING id
    `, [businessId, serviceId, date, time, customerName, customerEmail, customerPhone || '', notes || '', amountGBP]);
    return findById(rows[0].id);
  } catch (err) {
    if (err.code === '23505') { // Postgres unique_violation
      throw new SlotTakenError('That slot was just taken. Please pick another.');
    }
    throw err;
  }
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
  return rowToBooking(rows[0]);
}

async function findByIdForBusiness(id, businessId) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE id = $1 AND business_id = $2', [id, businessId]);
  return rowToBooking(rows[0]);
}

async function findByStripeSessionId(sessionId) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE stripe_session_id = $1', [sessionId]);
  return rowToBooking(rows[0]);
}

async function setStripeSessionId(id, sessionId) {
  await pool.query('UPDATE bookings SET stripe_session_id = $1 WHERE id = $2', [sessionId, id]);
}

async function setStatus(id, status) {
  await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', [status, id]);
}

async function confirmByStripeSessionId(sessionId) {
  await pool.query(`UPDATE bookings SET status = 'confirmed' WHERE stripe_session_id = $1`, [sessionId]);
}

async function listForBusiness(businessId) {
  const { rows } = await pool.query(`
    SELECT * FROM bookings WHERE business_id = $1 ORDER BY date DESC, time DESC
  `, [businessId]);
  return rows.map(rowToBooking);
}

async function cancel(id, businessId, cancellationFeeGBP) {
  const existing = await findByIdForBusiness(id, businessId);
  if (!existing) return null;
  if (existing.status === 'cancelled') throw new AlreadyCancelledError('Booking is already cancelled');

  await pool.query(`
    UPDATE bookings
    SET status = 'cancelled', cancellation_fee_gbp = $1, cancelled_at = now()
    WHERE id = $2
  `, [cancellationFeeGBP, id]);
  return findById(id);
}

module.exports = {
  SlotTakenError,
  AlreadyCancelledError,
  takenTimesForDate,
  create,
  findById,
  findByIdForBusiness,
  findByStripeSessionId,
  setStripeSessionId,
  setStatus,
  confirmByStripeSessionId,
  listForBusiness,
  cancel,
};
