const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireAdmin } = require('../middleware');

const router = express.Router();

// Public: candidate submits an application
router.post('/', (req, res) => {
  const { jobId, candidateName, email, phone, coverLetter, resumeName, resumeDataUrl } = req.body;
  if (!jobId || !candidateName || !email) {
    return res.status(400).json({ error: 'jobId, candidateName and email are required' });
  }
  const db = readDB();
  const job = db.jobs.find(j => j.id === Number(jobId));
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const application = {
    id: nextId(db, 'applications'),
    jobId: job.id,
    jobTitle: job.title,
    candidateName,
    email,
    phone: phone || '',
    coverLetter: coverLetter || '',
    resumeName: resumeName || '',
    resumeDataUrl: resumeDataUrl || '',
    status: 'applied', // applied -> screening -> interview -> offer -> hired / rejected
    appliedDate: new Date().toISOString()
  };
  db.applications.push(application);
  writeDB(db);
  res.status(201).json({ application });
});

// Admin: list all applications, optional filters
router.get('/', requireAdmin, (req, res) => {
  const db = readDB();
  let apps = db.applications;
  const { jobId, status } = req.query;
  if (jobId) apps = apps.filter(a => a.jobId === Number(jobId));
  if (status) apps = apps.filter(a => a.status === status);
  res.json({ applications: apps.sort((a, b) => new Date(b.appliedDate) - new Date(a.appliedDate)) });
});

// Admin: update application status
router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const db = readDB();
  const app = db.applications.find(a => a.id === Number(req.params.id));
  if (!app) return res.status(404).json({ error: 'Application not found' });
  app.status = status;
  writeDB(db);
  res.json({ application: app });
});

// Admin: convert a hired application into an employee record
router.post('/:id/hire', requireAdmin, (req, res) => {
  const db = readDB();
  const app = db.applications.find(a => a.id === Number(req.params.id));
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const job = db.jobs.find(j => j.id === app.jobId);

  const employee = {
    id: nextId(db, 'employees'),
    name: app.candidateName,
    email: app.email,
    department: job ? job.department : 'Unassigned',
    position: job ? job.title : 'Unassigned',
    joinDate: new Date().toISOString().slice(0, 10),
    status: 'active',
    phone: app.phone || ''
  };
  db.employees.push(employee);
  app.status = 'hired';
  writeDB(db);
  res.status(201).json({ employee });
});

module.exports = router;
