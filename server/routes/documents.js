const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list all company documents (visible to everyone)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  res.json({ documents: db.documents.sort((a, b) => new Date(b.uploadedDate) - new Date(a.uploadedDate)) });
});

// Logged-in: read the company shared drive link (e.g. SharePoint / Google Drive folder)
router.get('/shared-drive', requireLogin, (req, res) => {
  const db = readDB();
  const settings = db.settings || {};
  res.json({ link: settings.sharedDriveLink || '', label: settings.sharedDriveLabel || '' });
});

// Admin: set/update the company shared drive link
router.put('/shared-drive', requireAdmin, (req, res) => {
  const { link, label } = req.body;
  const db = readDB();
  if (!db.settings) db.settings = {};
  db.settings.sharedDriveLink = (link || '').trim();
  db.settings.sharedDriveLabel = (label || '').trim();
  writeDB(db);
  res.json({ link: db.settings.sharedDriveLink, label: db.settings.sharedDriveLabel });
});

// Admin: add a document (title/description/optional link — no file storage in this setup)
router.post('/', requireAdmin, (req, res) => {
  const { title, category, description, link } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const db = readDB();
  const document = {
    id: nextId(db, 'documents'),
    title, category: category || 'General', description: description || '', link: link || '',
    uploadedBy: req.session.user.name,
    uploadedDate: new Date().toISOString()
  };
  db.documents.push(document);
  writeDB(db);
  res.status(201).json({ document });
});

// Admin: delete a document
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.documents.findIndex(d => d.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Document not found' });
  db.documents.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
