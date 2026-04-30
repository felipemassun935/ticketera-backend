import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, requireAdmin, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'agent'));

// GET /api/templates
router.get('/', async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const where = {};
    if (category) where.category = category;
    if (search)   where.name = { contains: search, mode: 'insensitive' };

    const templates = await prisma.responseTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json({ templates });
  } catch (err) { next(err); }
});

// POST /api/templates
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, category, content } = req.body;
    if (!name?.trim())    return res.status(400).json({ error: 'name requerido' });
    if (!content?.trim()) return res.status(400).json({ error: 'content requerido' });

    const template = await prisma.responseTemplate.create({
      data: { name: name.trim(), category: category?.trim() || null, content: content.trim() },
    });
    res.status(201).json({ template });
  } catch (err) { next(err); }
});

// PATCH /api/templates/:id
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, category, content } = req.body;
    const data = {
      ...(name    !== undefined && { name:     name?.trim()     || undefined }),
      ...(category !== undefined && { category: category?.trim() || null }),
      ...(content !== undefined && { content:  content?.trim()  || undefined }),
    };

    const template = await prisma.responseTemplate.update({ where: { id }, data })
      .catch(e => {
        if (e.code === 'P2025') throw Object.assign(new Error('Plantilla no encontrada'), { status: 404 });
        throw e;
      });
    res.json({ template });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/templates/:id/toggle
router.patch('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const id       = Number(req.params.id);
    const existing = await prisma.responseTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const template = await prisma.responseTemplate.update({ where: { id }, data: { active: !existing.active } });
    res.json({ template });
  } catch (err) { next(err); }
});

// DELETE /api/templates/:id
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.responseTemplate.delete({ where: { id } }).catch(e => {
      if (e.code === 'P2025') throw Object.assign(new Error('Plantilla no encontrada'), { status: 404 });
      throw e;
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
