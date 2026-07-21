const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list all knowledge base articles
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  res.json({ articles: db.kbArticles.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate)) });
});

// Admin: publish an article
router.post('/', requireAdmin, (req, res) => {
  const { title, category, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
  const db = readDB();
  const article = {
    id: nextId(db, 'kbArticles'),
    title, category: category || 'General', content,
    publishedBy: req.session.user.name,
    publishedDate: new Date().toISOString()
  };
  db.kbArticles.push(article);
  writeDB(db);
  res.status(201).json({ article });
});

// Admin: delete an article
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.kbArticles.findIndex(a => a.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Article not found' });
  db.kbArticles.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
