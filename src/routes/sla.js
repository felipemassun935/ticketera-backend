import { Router } from 'express';
import { db, nextSlaId } from '../config/db.js';
import { requireAuth, requireRole, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'agent'));

router.get('/', async (req, res, next) => {
  try {
    await db.read();
    res.json({ rules: db.data.sla_rules });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const { name, priority, dept = 'all', r1, res: resolution, esc } = req.body;
    if (!name || !priority) return res.status(400).json({ error: 'name y priority requeridos' });
    const rule = { id: nextSlaId(), name, priority, dept, r1: r1 || null, res: resolution || null, esc: esc || null, active: true };
    db.data.sla_rules.push(rule);
    await db.write();
    res.status(201).json({ rule });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const id  = Number(req.params.id);
    const idx = db.data.sla_rules.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Regla no encontrada' });
    const { name, priority, dept, r1, res: resolution, esc } = req.body;
    db.data.sla_rules[idx] = { ...db.data.sla_rules[idx], ...(name && { name }), ...(priority && { priority }), ...(dept && { dept }), ...(r1 !== undefined && { r1 }), ...(resolution !== undefined && { res: resolution }), ...(esc !== undefined && { esc }) };
    await db.write();
    res.json({ rule: db.data.sla_rules[idx] });
  } catch (err) { next(err); }
});

router.patch('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const id  = Number(req.params.id);
    const idx = db.data.sla_rules.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Regla no encontrada' });
    db.data.sla_rules[idx] = { ...db.data.sla_rules[idx], active: !db.data.sla_rules[idx].active };
    await db.write();
    res.json({ rule: db.data.sla_rules[idx] });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const id = Number(req.params.id);
    if (!db.data.sla_rules.find(r => r.id === id)) return res.status(404).json({ error: 'Regla no encontrada' });
    db.data.sla_rules = db.data.sla_rules.filter(r => r.id !== id);
    await db.write();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
