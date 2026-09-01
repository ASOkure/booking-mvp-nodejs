const db = require('../db');

class SlotTakenError extends Error {}

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

function takenTimesForDate(businessId, date) {
  return db.prepare(`
    SELECT time FROM bookings WHERE business_id = ? AND date = ? AND status <> 'cancelled'
  `).all(businessId, date).map(r => r.time);
}

function create({ businessId, serviceId, date, time, customerName, customerEmail, customerPhone, notes, amountGBP }) {
  try {
    const info = db.prepare(`
      INSERT INTO bookings (business_id, service_id, date, time, customer_name, customer_email, customer_phone, notes, amount_gbp, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(businessId, serviceId, date, time, customerName, customerEmail, customerPhone || '', notes || '', amountGBP);
    return findById(info.lastInsertRowid);
  } catch (err) {
    if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message)) {
      throw new SlotTakenError('That slot was just taken. Please pick another.');
    }
    throw err;
  }
}

function findById(id) {
  return rowToBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id));
}

function findByStripeSessionId(sessionId) {
  return rowToBooking(db.prepare('SELECT * FROM bookings WHERE stripe_session_id = ?').get(sessionId));
}

function setStripeSessionId(id, sessionId) {
  db.prepare('UPDATE bookings SET stripe_session_id = ? WHERE id = ?').run(sessionId, id);
}

function setStatus(id, status) {
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
}

function confirmByStripeSessionId(sessionId) {
  db.prepare(`UPDATE bookings SET status = 'confirmed' WHERE stripe_session_id = ?`).run(sessionId);
}

function listForBusiness(businessId) {
  return db.prepare(`
    SELECT * FROM bookings WHERE business_id = ? ORDER BY date DESC, time DESC
  `).all(businessId).map(rowToBooking);
}

function findByIdForBusiness(id, businessId) {
  return rowToBooking(db.prepare('SELECT * FROM bookings WHERE id = ? AND business_id = ?').get(id, businessId));
}

class AlreadyCancelledError extends Error {}

function cancel(id, businessId, cancellationFeeGBP) {
  const existing = findByIdForBusiness(id, businessId);
  if (!existing) return null;
  if (existing.status === 'cancelled') throw new AlreadyCancelledError('Booking is already cancelled');

  db.prepare(`
    UPDATE bookings
    SET status = 'cancelled', cancellation_fee_gbp = ?, cancelled_at = datetime('now')
    WHERE id = ?
  `).run(cancellationFeeGBP, id);
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
