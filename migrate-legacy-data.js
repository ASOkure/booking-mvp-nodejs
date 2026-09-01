// One-off script: migrates the previous single-tenant BUSINESS config and
// data.json bookings into the new multi-tenant SQLite schema. Not web-exposed.
//
// Usage:
//   npm run migrate-legacy-data -- --email owner@example.com --password 'a-real-password' [--slug aster-co]

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const businesses = require('./repositories/businesses');
const services = require('./repositories/services');
const bookings = require('./repositories/bookings');
const { hashPassword } = require('./auth');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    args[key] = process.argv[i + 1];
  }
  return args;
}

const LEGACY_SERVICES = [
  { name: 'Standard Clean', durationMinutes: 60, priceGBP: 35, description: 'A thorough clean of kitchen, bathroom, and living areas.', legacyId: 'standard-clean' },
  { name: 'Deep Clean', durationMinutes: 120, priceGBP: 75, description: 'Top-to-bottom clean including skirting boards, appliances, and windowsills.', legacyId: 'deep-clean' },
  { name: 'End of Tenancy', durationMinutes: 180, priceGBP: 120, description: 'Full move-out clean designed to help secure your deposit back.', legacyId: 'end-of-tenancy' },
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  const args = parseArgs();
  if (!args.email || !args.password) {
    console.error('Usage: node migrate-legacy-data.js --email owner@example.com --password \'...\' [--slug aster-co]');
    process.exit(1);
  }

  const name = process.env.BUSINESS_NAME || 'Aster & Co.';
  const slug = args.slug || slugify(name);

  if (businesses.getBySlug(slug)) {
    console.error(`Business with slug "${slug}" already exists. Nothing to do.`);
    process.exit(1);
  }

  const business = businesses.create({
    slug,
    name,
    tagline: process.env.BUSINESS_TAGLINE || 'Local, reliable, booked in minutes.',
    about: process.env.BUSINESS_ABOUT || '',
    timezone: 'Europe/London',
    workingHours: { start: '08:00', end: '17:00' },
    slotMinutes: 60,
    closedDays: [0],
    cancellationFeeGBP: Number(process.env.CANCELLATION_FEE_GBP || 0),
    adminEmail: args.email,
    adminPasswordHash: await hashPassword(args.password),
  });
  console.log(`Created business "${business.name}" (slug: ${business.slug}, id: ${business.id})`);

  const serviceIdMap = {};
  for (const s of LEGACY_SERVICES) {
    const created = services.create(business.id, s);
    serviceIdMap[s.legacyId] = created.id;
    console.log(`  Service: ${created.name} -> id ${created.id}`);
  }

  const dataPath = path.join(__dirname, 'data.json');
  let imported = 0;
  let skipped = 0;
  if (fs.existsSync(dataPath)) {
    const legacyBookings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    for (const b of legacyBookings) {
      const serviceId = serviceIdMap[b.service_id];
      if (!serviceId) {
        console.warn(`  Skipping booking ${b.id}: unknown service_id "${b.service_id}"`);
        skipped++;
        continue;
      }
      try {
        const created = bookings.create({
          businessId: business.id,
          serviceId,
          date: b.date,
          time: b.time,
          customerName: b.customer_name,
          customerEmail: b.customer_email,
          customerPhone: b.customer_phone,
          notes: b.notes,
          amountGBP: b.amount_gbp,
        });
        bookings.setStatus(created.id, b.status);
        imported++;
      } catch (err) {
        console.warn(`  Skipping booking ${b.id} (${b.date} ${b.time}): ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`\nImported ${imported} booking(s), skipped ${skipped}.`);
  console.log(`\nSet this in your environment so "/" keeps working:\n  DEFAULT_BUSINESS_SLUG=${slug}`);
  console.log(`\nAdmin login: POST /api/admin/login { "email": "${args.email}", "password": "<what you passed>" }`);
}

main();
