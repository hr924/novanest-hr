const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAdmin } = require('../middleware');
const { readDB, listBackups, restoreBackup, backupNow, BACKUP_DIR } = require('../db');

const router = express.Router();

// Admin: list available backups, newest first
router.get('/', requireAdmin, (req, res) => {
  res.json({ backups: listBackups() });
});

// Admin: force a backup of the current live data right now
router.post('/', requireAdmin, (req, res) => {
  const db = readDB();
  backupNow(db, true);
  res.status(201).json({ ok: true });
});

// Admin: restore the live database from a specific backup file
router.post('/:filename/restore', requireAdmin, (req, res) => {
  try {
    restoreBackup(req.params.filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: download a backup file
router.get('/:filename/download', requireAdmin, (req, res) => {
  const safeName = path.basename(req.params.filename);
  const file = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Backup not found' });
  res.download(file, safeName);
});

module.exports = router;
