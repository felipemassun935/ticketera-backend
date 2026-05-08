import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const priorities = await prisma.priority.findMany({ orderBy: { sort_order: 'asc' } });
    res.json({ priorities });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { id, label, color = '#888888', r1, res: resolution, esc, sort_order = 0 } = req.body;
    if (!id || !label) return res.status(400).json({ error: 'id y label requeridos' });

    const priority = await prisma.priority.create({
      data: { id, label, color, r1: r1 || null, res: resolution || null, esc: esc || null, sort_order, active: true },
    }).catch(e => {
      if (e.code === 'P2002') throw Object.assign(new Error(`Ya existe la prioridad "${id}"`), { status: 409 });
      throw e;
    });

    res.status(201).json({ priority });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { label, color, r1, res: resolution, esc, sort_order } = req.body;
    const data = {
      ...(label       !== undefined && { label }),
      ...(color       !== undefined && { color }),
      ...(r1          !== undefined && { r1: r1 || null }),
      ...(resolution  !== undefined && { res: resolution || null }),
      ...(esc         !== undefined && { esc: esc || null }),
      ...(sort_order  !== undefined && { sort_order }),
    };

    const priority = await prisma.priority.update({ where: { id: req.params.id }, data })
      .catch(e => {
        if (e.code === 'P2025') throw Object.assign(new Error('Prioridad no encontrada'), { status: 404 });
        throw e;
      });

    res.json({ priority });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.priority.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Prioridad no encontrada' });

    const priority = await prisma.priority.update({ where: { id: req.params.id }, data: { active: !existing.active } });
    res.json({ priority });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const count = await prisma.ticket.count({ where: { priority: req.params.id } });
    if (count > 0) return res.status(409).json({ error: `Hay ${count} tickets con esta prioridad` });

    await prisma.priority.delete({ where: { id: req.params.id } }).catch(e => {
      if (e.code === 'P2025') throw Object.assign(new Error('Prioridad no encontrada'), { status: 404 });
      throw e;
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
