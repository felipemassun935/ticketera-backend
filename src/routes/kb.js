import { Router } from 'express';
import { prisma, nextKbId } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { cat, search, status } = req.query;
    const where = {};
    if (req.user.role === 'customer') {
      where.status = 'published';
    } else if (status) {
      where.status = status;
    }
    if (cat)    where.cat   = cat;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const articles = await prisma.kbArticle.findMany({ where, orderBy: { views: 'desc' } });
    res.json({ articles });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const article = await prisma.kbArticle.findUnique({ where: { id: req.params.id } });
    if (!article) return res.status(404).json({ error: 'Artículo no encontrado' });
    if (req.user.role === 'customer' && article.status !== 'published')
      return res.status(404).json({ error: 'Artículo no encontrado' });

    const updated = await prisma.kbArticle.update({ where: { id: req.params.id }, data: { views: { increment: 1 } } });
    res.json({ article: updated });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { title, cat, content = '', status = 'draft' } = req.body;
    if (!title) return res.status(400).json({ error: 'title requerido' });

    const article = await prisma.kbArticle.create({
      data: { id: await nextKbId(), title, cat: cat || null, content, views: 0, status },
    });
    res.status(201).json({ article });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { title, cat, content, status } = req.body;
    const data = {
      ...(title                && { title }),
      ...(cat !== undefined    && { cat }),
      ...(content !== undefined && { content }),
      ...(status               && { status }),
    };

    const article = await prisma.kbArticle.update({ where: { id: req.params.id }, data })
      .catch(e => {
        if (e.code === 'P2025') throw Object.assign(new Error('Artículo no encontrado'), { status: 404 });
        throw e;
      });

    res.json({ article });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.kbArticle.delete({ where: { id: req.params.id } }).catch(e => {
      if (e.code === 'P2025') throw Object.assign(new Error('Artículo no encontrado'), { status: 404 });
      throw e;
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
