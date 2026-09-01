const express = require('express');
const businesses = require('../repositories/businesses');
const services = require('../repositories/services');
const { requirePlatformKey, hashPassword } = require('../auth');

const router = express.Router();

router.use(requirePlatformKey);

router.post('/businesses', async (req, res) => {
  const {
    slug, name, tagline, about, timezone,
    workingHours, slotMinutes, closedDays, cancellationFeeGBP,
    adminEmail, adminPassword, services: serviceList,
  } = req.body;

  if (!slug || !name || !workingHours || !slotMinutes || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'slug, name, workingHours, slotMinutes, adminEmail, adminPassword are required' });
  }
  if (businesses.getBySlug(slug)) {
    return res.status(409).json({ error: 'Slug already in use' });
  }
  if (businesses.findByAdminEmail(adminEmail)) {
    return res.status(409).json({ error: 'Admin email already in use' });
  }

  const business = businesses.create({
    slug, name, tagline, about, timezone,
    workingHours, slotMinutes, closedDays, cancellationFeeGBP,
    adminEmail, adminPasswordHash: await hashPassword(adminPassword),
  });

  const created = (serviceList || []).map(s => services.create(business.id, s));

  res.status(201).json({ business: { id: business.id, slug: business.slug, name: business.name }, services: created });
});

module.exports = router;
