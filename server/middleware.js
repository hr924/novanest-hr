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

module.exports = { requireLogin, requireAdmin, requireManagerOrAdmin };
