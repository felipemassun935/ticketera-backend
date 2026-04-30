import { Router } from 'express';
import { db } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
const now = () => new Date().toISOString();

function withCount(q, data) {
  return {
    ...q,
    ticket_count: data.tickets.filter(t => t.queue_id === q.id && !['closed','resolved'].includes(t.status)).length,
  };
}

router.get('/', async (req, res, next) => {
  try {
    await db.read();
    res.json({ queues: db.data.queues.map(q => withCount(q, db.data)) });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const { id, name, owner_name, color = '#888888' } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id y name requeridos' });
    if (db.data.queues.find(q => q.id === id)) return res.status(409).json({ error: `Ya existe la bandeja "${id}"` });

    const queue = { id, name, owner_name: owner_name || null, color, active: true, created_at: now(), updated_at: now() };
    db.data.queues.push(queue);
    await db.write();
    res.status(201).json({ queue: withCount(queue, db.data) });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const idx = db.data.queues.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Bandeja no encontrada' });

    const { name, owner_name, color } = req.body;
    db.data.queues[idx] = { ...db.data.queues[idx], ...(name && { name }), ...(owner_name !== undefined && { owner_name }), ...(color && { color }), updated_at: now() };
    await db.write();
    res.json({ queue: withCount(db.data.queues[idx], db.data) });
  } catch (err) { next(err); }
});

router.patch('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const idx = db.data.queues.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Bandeja no encontrada' });
    db.data.queues[idx] = { ...db.data.queues[idx], active: !db.data.queues[idx].active, updated_at: now() };
    await db.write();
    res.json({ queue: withCount(db.data.queues[idx], db.data) });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const queue = db.data.queues.find(q => q.id === req.params.id);
    if (!queue) return res.status(404).json({ error: 'Bandeja no encontrada' });
    const active = db.data.tickets.filter(t => t.queue_id === req.params.id && !['closed','resolved'].includes(t.status)).length;
    if (active > 0) return res.status(409).json({ error: `La bandeja tiene ${active} tickets activos` });
    db.data.queues = db.data.queues.filter(q => q.id !== req.params.id);
    await db.write();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
