import { Router } from 'express';
import { db, nextKbId } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
const now = () => new Date().toISOString();

router.get('/', async (req, res, next) => {
  try {
    await db.read();
    const { cat, search, status } = req.query;
    let articles = [...db.data.kb_articles];
    if (req.user.role === 'customer') articles = articles.filter(a => a.status === 'published');
    else if (status)                  articles = articles.filter(a => a.status === status);
    if (cat)    articles = articles.filter(a => a.cat === cat);
    if (search) articles = articles.filter(a => a.title.toLowerCase().includes(search.toLowerCase()));
    articles.sort((a, b) => b.views - a.views);
    res.json({ articles });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    await db.read();
    const idx = db.data.kb_articles.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Artículo no encontrado' });
    const article = db.data.kb_articles[idx];
    if (req.user.role === 'customer' && article.status !== 'published')
      return res.status(404).json({ error: 'Artículo no encontrado' });
    db.data.kb_articles[idx] = { ...article, views: article.views + 1 };
    await db.write();
    res.json({ article: db.data.kb_articles[idx] });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const { title, cat, content = '', status = 'draft' } = req.body;
    if (!title) return res.status(400).json({ error: 'title requerido' });
    const ts      = now();
    const article = { id: nextKbId(), title, cat: cat || null, content, views: 0, status, created_at: ts, updated_at: ts };
    db.data.kb_articles.push(article);
    await db.write();
    res.status(201).json({ article });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const idx = db.data.kb_articles.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Artículo no encontrado' });
    const { title, cat, content, status } = req.body;
    db.data.kb_articles[idx] = { ...db.data.kb_articles[idx], ...(title && { title }), ...(cat !== undefined && { cat }), ...(content !== undefined && { content }), ...(status && { status }), updated_at: now() };
    await db.write();
    res.json({ article: db.data.kb_articles[idx] });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    if (!db.data.kb_articles.find(a => a.id === req.params.id)) return res.status(404).json({ error: 'Artículo no encontrado' });
    db.data.kb_articles = db.data.kb_articles.filter(a => a.id !== req.params.id);
    await db.write();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
