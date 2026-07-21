const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list surveys, with the employee's own response (if any) attached
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  const surveys = db.surveys.map(s => {
    const responses = db.surveyResponses.filter(r => r.surveyId === s.id);
    const myResponse = responses.find(r => r.employeeId === user.employeeId);
    const result = { ...s, responseCount: responses.length, myAnswer: myResponse ? myResponse.answer : null };
    if (user.role === 'admin') {
      const tally = {};
      s.options.forEach(o => { tally[o] = 0; });
      responses.forEach(r => { tally[r.answer] = (tally[r.answer] || 0) + 1; });
      result.tally = tally;
    }
    return result;
  });
  res.json({ surveys: surveys.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate)) });
});

// Admin: create a survey
router.post('/', requireAdmin, (req, res) => {
  const { question, options } = req.body;
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'question and at least 2 options are required' });
  }
  const db = readDB();
  const survey = {
    id: nextId(db, 'surveys'),
    question,
    options: options.filter(Boolean),
    createdBy: req.session.user.name,
    createdDate: new Date().toISOString()
  };
  db.surveys.push(survey);
  writeDB(db);
  res.status(201).json({ survey });
});

// Employee: respond to a survey (one response per employee per survey)
router.post('/:id/respond', requireLogin, (req, res) => {
  const { answer } = req.body;
  const { user } = req.session;
  if (!user.employeeId) return res.status(400).json({ error: 'No employee profile linked to this account' });
  const db = readDB();
  const survey = db.surveys.find(s => s.id === Number(req.params.id));
  if (!survey) return res.status(404).json({ error: 'Survey not found' });
  if (!survey.options.includes(answer)) return res.status(400).json({ error: 'Invalid answer option' });
  if (db.surveyResponses.some(r => r.surveyId === survey.id && r.employeeId === user.employeeId)) {
    return res.status(400).json({ error: 'You already responded to this survey' });
  }
  const response = {
    id: nextId(db, 'surveyResponses'),
    surveyId: survey.id,
    employeeId: user.employeeId,
    answer,
    respondedDate: new Date().toISOString()
  };
  db.surveyResponses.push(response);
  writeDB(db);
  res.status(201).json({ response });
});

// Admin: delete a survey
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.surveys.findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Survey not found' });
  db.surveys.splice(idx, 1);
  db.surveyResponses = db.surveyResponses.filter(r => r.surveyId !== Number(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
