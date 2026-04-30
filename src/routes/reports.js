import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'agent'));

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// GET /api/reports?month=2026-04  (defaults to current month)
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    let year  = now.getFullYear();
    let month = now.getMonth(); // 0-based

    if (req.query.month) {
      const [y, m] = req.query.month.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) { year = y; month = m - 1; }
    }

    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const [tickets, queues] = await Promise.all([
      prisma.ticket.findMany({
        where:  { created_at: { gte: start, lte: end } },
        select: {
          id:            true,
          status:        true,
          priority:      true,
          assignee_name: true,
          queue_id:      true,
          sla_deadline:  true,
          created_at:    true,
          queue:         { select: { name: true } },
        },
      }),
      prisma.queue.findMany({ where: { active: true }, select: { id: true, name: true } }),
    ]);

    const isResolved = t => ['closed', 'resolved'].includes(t.status);
    const resolved   = tickets.filter(isResolved);
    const active     = tickets.filter(t => !isResolved(t));
    const slaExpired = active.filter(t => t.sla_deadline && new Date(t.sla_deadline) < now);
    const unassigned = active.filter(t => !t.assignee_name);

    // ── By queue ──────────────────────────────────────────────────
    const queueMap = Object.fromEntries(
      queues.map(q => [q.id, { queue_id: q.id, queue_name: q.name, open: 0, resolved: 0 }])
    );
    for (const t of tickets) {
      if (!queueMap[t.queue_id]) {
        queueMap[t.queue_id] = { queue_id: t.queue_id, queue_name: t.queue?.name ?? t.queue_id, open: 0, resolved: 0 };
      }
      if (isResolved(t)) queueMap[t.queue_id].resolved++;
      else               queueMap[t.queue_id].open++;
    }
    const by_queue = Object.values(queueMap)
      .map(q => ({ ...q, total: q.open + q.resolved }))
      .sort((a, b) => b.total - a.total);

    // ── By agent ──────────────────────────────────────────────────
    const agentMap = {};
    for (const t of tickets) {
      if (!t.assignee_name) continue;
      if (!agentMap[t.assignee_name]) agentMap[t.assignee_name] = { name: t.assignee_name, resolved: 0, open: 0 };
      if (isResolved(t)) agentMap[t.assignee_name].resolved++;
      else               agentMap[t.assignee_name].open++;
    }
    const by_agent = Object.values(agentMap)
      .map(a => ({ ...a, total: a.resolved + a.open }))
      .sort((a, b) => b.resolved - a.resolved);

    // ── By priority ───────────────────────────────────────────────
    const priMap = { urgent: 0, high: 0, medium: 0, low: 0 };
    for (const t of tickets) if (priMap[t.priority] !== undefined) priMap[t.priority]++;

    res.json({
      period: `${MONTH_NAMES[month]} ${year}`,
      kpis: {
        total:           tickets.length,
        resolved:        resolved.length,
        resolution_rate: tickets.length ? Math.round(resolved.length / tickets.length * 100) : 0,
        open:            active.length,
        sla_expired:     slaExpired.length,
        unassigned:      unassigned.length,
      },
      by_priority: priMap,
      by_queue,
      by_agent,
    });
  } catch (err) { next(err); }
});

export default router;
