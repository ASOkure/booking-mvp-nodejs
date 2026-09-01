const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set (see .env.example)');
}

function signAdminToken({ businessId, slug }) {
  return jwt.sign({ businessId, slug }, JWT_SECRET, { expiresIn: '24h' });
}

function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    req.businessId = payload.businessId;
    req.businessSlug = payload.slug;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requirePlatformKey(req, res, next) {
  const key = req.headers['x-platform-key'];
  if (!key || key !== process.env.PLATFORM_ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { signAdminToken, requireAdminAuth, requirePlatformKey, hashPassword, verifyPassword };
