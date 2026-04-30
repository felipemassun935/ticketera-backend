import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function fmt({ tickets, ...q }) {
  return { ...q, ticket_count: tickets.length };
}

const QUEUE_INCLUDE = {
  tickets: { where: { status: { notIn: ['closed', 'resolved'] } }, select: { id: true } },
};

router.get('/', async (req, res, next) => {
  try {
    const queues = await prisma.queue.findMany({ include: QUEUE_INCLUDE });
    res.json({ queues: queues.map(fmt) });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { id, name, owner_name, color = '#888888' } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id y name requeridos' });

    const queue = await prisma.queue.create({
      data: { id, name, owner_name: owner_name || null, color, active: true },
      include: QUEUE_INCLUDE,
    }).catch(e => {
      if (e.code === 'P2002') throw Object.assign(new Error(`Ya existe la bandeja "${id}"`), { status: 409 });
      throw e;
    });

    res.status(201).json({ queue: fmt(queue) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name, owner_name, color } = req.body;
    const data = {
      ...(name                     && { name }),
      ...(owner_name !== undefined && { owner_name }),
      ...(color                    && { color }),
    };

    const queue = await prisma.queue.update({ where: { id: req.params.id }, data, include: QUEUE_INCLUDE })
      .catch(e => {
        if (e.code === 'P2025') throw Object.assign(new Error('Bandeja no encontrada'), { status: 404 });
        throw e;
      });

    res.json({ queue: fmt(queue) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.queue.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Bandeja no encontrada' });

    const queue = await prisma.queue.update({ where: { id: req.params.id }, data: { active: !existing.active }, include: QUEUE_INCLUDE });
    res.json({ queue: fmt(queue) });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const activeCount = await prisma.ticket.count({
      where: { queue_id: req.params.id, status: { notIn: ['closed', 'resolved'] } },
    });
    if (activeCount > 0) return res.status(409).json({ error: `La bandeja tiene ${activeCount} tickets activos` });

    await prisma.queue.delete({ where: { id: req.params.id } }).catch(e => {
      if (e.code === 'P2025') throw Object.assign(new Error('Bandeja no encontrada'), { status: 404 });
      throw e;
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
