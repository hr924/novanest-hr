const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireAdmin } = require('../middleware');

const router = express.Router();

// Public: list open jobs (careers page)
router.get('/', (req, res) => {
  const db = readDB();
  const { all } = req.query;
  const jobs = all === '1' ? db.jobs : db.jobs.filter(j => j.status === 'open');
  res.json({ jobs: jobs.sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate)) });
});

router.get('/:id', (req, res) => {
  const db = readDB();
  const job = db.jobs.find(j => j.id === Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

// Admin: create job
router.post('/', requireAdmin, (req, res) => {
  const { title, department, location, type, description } = req.body;
  if (!title || !department) return res.status(400).json({ error: 'Title and department are required' });
  const db = readDB();
  const job = {
    id: nextId(db, 'jobs'),
    title, department, location: location || '', type: type || 'Full-time',
    description: description || '', status: 'open', postedDate: new Date().toISOString()
  };
  db.jobs.push(job);
  writeDB(db);
  res.status(201).json({ job });
});

// Admin: update job (edit or change status)
router.put('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const job = db.jobs.find(j => j.id === Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  Object.assign(job, req.body);
  writeDB(db);
  res.json({ job });
});

// Admin: delete job
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.jobs.findIndex(j => j.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  db.jobs.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
