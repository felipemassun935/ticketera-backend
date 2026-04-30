import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, requireRole, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'agent'));

router.get('/', async (req, res, next) => {
  try {
    const rules = await prisma.slaRule.findMany();
    res.json({ rules });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, priority, dept = 'all', r1, res: resolution, esc } = req.body;
    if (!name || !priority) return res.status(400).json({ error: 'name y priority requeridos' });

    const rule = await prisma.slaRule.create({
      data: { name, priority, dept, r1: r1 || null, res: resolution || null, esc: esc || null, active: true },
    });
    res.status(201).json({ rule });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, priority, dept, r1, res: resolution, esc } = req.body;
    const data = {
      ...(name                  && { name }),
      ...(priority              && { priority }),
      ...(dept                  && { dept }),
      ...(r1 !== undefined      && { r1 }),
      ...(resolution !== undefined && { res: resolution }),
      ...(esc !== undefined     && { esc }),
    };

    const rule = await prisma.slaRule.update({ where: { id }, data }).catch(e => {
      if (e.code === 'P2025') throw Object.assign(new Error('Regla no encontrada'), { status: 404 });
      throw e;
    });

    res.json({ rule });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const id       = Number(req.params.id);
    const existing = await prisma.slaRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Regla no encontrada' });

    const rule = await prisma.slaRule.update({ where: { id }, data: { active: !existing.active } });
    res.json({ rule });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.slaRule.delete({ where: { id } }).catch(e => {
      if (e.code === 'P2025') throw Object.assign(new Error('Regla no encontrada'), { status: 404 });
      throw e;
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
