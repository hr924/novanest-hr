const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list assets (admin sees all, employee sees their own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let assets = db.assets;
  if (user.role !== 'admin') {
    assets = assets.filter(a => a.employeeId === user.employeeId);
  }
  res.json({ assets: assets.sort((a, b) => new Date(b.assignedDate) - new Date(a.assignedDate)) });
});

// Admin: assign an asset to an employee
router.post('/', requireAdmin, (req, res) => {
  const { employeeId, assetName, assetType, serialNumber } = req.body;
  if (!employeeId || !assetName) return res.status(400).json({ error: 'employeeId and assetName are required' });
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const asset = {
    id: nextId(db, 'assets'),
    employeeId: employee.id,
    employeeName: employee.name,
    assetName, assetType: assetType || 'Equipment', serialNumber: serialNumber || '',
    status: 'assigned',
    assignedDate: new Date().toISOString()
  };
  db.assets.push(asset);
  writeDB(db);
  res.status(201).json({ asset });
});

// Admin: mark an asset returned
router.put('/:id/return', requireAdmin, (req, res) => {
  const db = readDB();
  const asset = db.assets.find(a => a.id === Number(req.params.id));
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  asset.status = 'returned';
  asset.returnedDate = new Date().toISOString();
  writeDB(db);
  res.json({ asset });
});

// Admin: delete an asset record
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.assets.findIndex(a => a.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Asset not found' });
  db.assets.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
