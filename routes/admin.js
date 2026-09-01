const express = require('express');
const businesses = require('../repositories/businesses');
const services = require('../repositories/services');
const bookings = require('../repositories/bookings');
const { signAdminToken, requireAdminAuth, verifyPassword } = require('../auth');

const router = express.Router();

async function profilePayload(business) {
  return {
    business: {
      slug: business.slug,
      name: business.name,
      tagline: business.tagline,
      about: business.about,
      workingHours: business.workingHours,
      slotMinutes: business.slotMinutes,
      closedDays: business.closedDays,
      cancellationFeeGBP: business.cancellationFeeGBP,
    },
    services: await services.listForBusiness(business.id),
  };
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const business = await businesses.findByAdminEmail(email);
  if (!business || !(await verifyPassword(password, business.adminPasswordHash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  const token = signAdminToken({ businessId: business.id, slug: business.slug });
  res.json({ token, ...(await profilePayload(business)) });
});

router.use(requireAdminAuth);

router.get('/me', async (req, res) => {
  res.json(await profilePayload(await businesses.getById(req.businessId)));
});

router.get('/bookings', async (req, res) => {
  res.json(await bookings.listForBusiness(req.businessId));
});

router.post('/bookings/:id/cancel', async (req, res) => {
  const business = await businesses.getById(req.businessId);
  try {
    const updated = await bookings.cancel(Number(req.params.id), req.businessId, business.cancellationFeeGBP > 0 ? business.cancellationFeeGBP : 0);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    if (err instanceof bookings.AlreadyCancelledError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
});

module.exports = router;
