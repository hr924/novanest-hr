function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireManagerOrAdmin(req, res, next) {
  if (!req.session.user || !['admin', 'manager'].includes(req.session.user.role)) {
    return res.status(403).json({ error: 'Manager or admin access required' });
  }
  next();
}

// Shared kiosk devices aren't logged in as anyone — they authenticate with a
// long-lived device token instead of a session. This gates the endpoints that
// read face templates or mark attendance without a real user session behind
// them, so it needs its own check rather than reusing requireLogin.
function requireKiosk(req, res, next) {
  const { readDB } = require('./db');
  const token = req.get('X-Kiosk-Token');
  const db = readDB();
  if (!token || token !== db.settings.kioskToken) {
    return res.status(401).json({ error: 'Invalid or missing kiosk token' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin, requireManagerOrAdmin, requireKiosk };
