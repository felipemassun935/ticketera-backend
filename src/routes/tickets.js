import { Router } from 'express';
import { prisma, nextTicketId } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { actionLogger } from '../middleware/logger.js';

const router = Router();
router.use(requireAuth);

const TICKET_INCLUDE = {
  queue:    { select: { name: true, color: true } },
  assignee: { select: { id: true, name: true, email: true } },
  tags:     { select: { tag: true } },
  history:  { orderBy: { created_at: 'asc' } },
};

function fmt({ queue, assignee, tags, history, ...t }) {
  return {
    ...t,
    queue_name:  queue?.name  ?? null,
    queue_color: queue?.color ?? null,
    assignee:    assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
    tags:        tags.map(x => x.tag),
    history,
  };
}

function parseSlaMinutes(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(h|m)$/);
  if (!m) return null;
  return m[2] === 'h' ? Number(m[1]) * 60 : Number(m[1]);
}

// GET /api/tickets
router.get('/', async (req, res, next) => {
  try {
    const { status, queue, assignee, priority, search, page = 1, limit = 200 } = req.query;

    const where = {};
    if (req.user.role === 'customer') where.requester_email = req.user.email;
    if (status)   where.status        = status;
    if (queue)    where.queue_id      = queue;
    if (assignee) where.assignee_name = assignee;
    if (priority) where.priority      = priority;
    if (search) {
      where.OR = [
        { title:          { contains: search, mode: 'insensitive' } },
        { id:             { contains: search, mode: 'insensitive' } },
        { requester_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include:  TICKET_INCLUDE,
        orderBy:  { updated_at: 'desc' },
        skip:     (Number(page) - 1) * Number(limit),
        take:     Number(limit),
      }),
    ]);

    res.json({ tickets: tickets.map(fmt), total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/tickets/:id
router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: TICKET_INCLUDE });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (req.user.role === 'customer' && ticket.requester_email !== req.user.email)
      return res.status(403).json({ error: 'Sin acceso a este ticket' });
    res.json({ ticket: fmt(ticket) });
  } catch (err) { next(err); }
});

// POST /api/tickets
router.post('/', async (req, res, next) => {
  try {
    const { title, queue_id, category, priority = 'medium', description, tags = [], sla_deadline, dept } = req.body;
    if (!title || !queue_id) return res.status(400).json({ error: 'title y queue_id requeridos' });

    // Auto-calculate SLA deadline from active rules if not explicitly provided
    let computedDeadline = sla_deadline || null;
    if (!computedDeadline) {
      const rules = await prisma.slaRule.findMany({ where: { priority, active: true } });
      const rule  = rules.find(r => dept && r.dept === dept) || rules.find(r => r.dept === 'all');
      const mins  = parseSlaMinutes(rule?.res);
      if (mins) computedDeadline = new Date(Date.now() + mins * 60 * 1000).toISOString();
    }

    const id     = await nextTicketId();
    const ticket = await prisma.ticket.create({
      data: {
        id, title,
        requester_name:  req.user.name,
        requester_email: req.user.email,
        queue_id, dept: dept || null, category: category || null,
        status: 'new', priority,
        sla_deadline: computedDeadline,
        tags:    { createMany: { data: tags.map(tag => ({ tag })) } },
        history: { create: { type: 'created', to_val: 'new', comment: description || 'Ticket creado.', category: 'Diagnóstico', agent_name: req.user.name } },
      },
      include: TICKET_INCLUDE,
    });

    actionLogger('TICKET_CREATED', `${ticket.id} "${title}" [${priority}] por ${req.user.name}`);
    res.status(201).json({ ticket: fmt(ticket) });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/update
router.post('/:id/update', requireRole('admin', 'agent'), async (req, res, next) => {
  try {
    const { comment, status, category = 'Diagnóstico' } = req.body;
    if (!comment?.trim()) return res.status(400).json({ error: 'comment requerido' });

    const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado' });

    const historyEntries = [];
    const ticketData     = {};

    if (status && status !== existing.status) {
      ticketData.status = status;
      historyEntries.push({ type: 'status_change', from_val: existing.status, to_val: status, comment: '', category, agent_name: req.user.name });

      if (status === 'paused') {
        // Freeze the SLA clock
        ticketData.sla_paused_at = new Date();
        actionLogger('SLA_PAUSED', `${req.params.id} por ${req.user.name}`);
      } else if (existing.status === 'paused' && existing.sla_paused_at && existing.sla_deadline) {
        // Extend deadline by however long the ticket was paused
        const pausedMs       = Date.now() - new Date(existing.sla_paused_at).getTime();
        const newDeadline    = new Date(new Date(existing.sla_deadline).getTime() + pausedMs);
        ticketData.sla_deadline   = newDeadline.toISOString();
        ticketData.sla_paused_at  = null;
        actionLogger('SLA_RESUMED', `${req.params.id} deadline → ${newDeadline.toISOString()} (+${Math.round(pausedMs / 60000)}m) por ${req.user.name}`);
      }
    }
    historyEntries.push({ type: 'comment', from_val: '', to_val: '', comment, category, agent_name: req.user.name });

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data:  { ...ticketData, history: { createMany: { data: historyEntries } } },
      include: TICKET_INCLUDE,
    });

    if (status && status !== existing.status && status !== 'paused') {
      actionLogger('STATUS_CHANGE', `${req.params.id} ${existing.status} → ${status} por ${req.user.name}`);
    }
    res.json({ ticket: fmt(ticket) });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/move
router.post('/:id/move', requireRole('admin', 'agent'), async (req, res, next) => {
  try {
    const { queue_id, note = '' } = req.body;
    if (!queue_id) return res.status(400).json({ error: 'queue_id requerido' });

    const [existing, targetQueue] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: req.params.id } }),
      prisma.queue.findUnique({ where: { id: queue_id } }),
    ]);
    if (!existing)    return res.status(404).json({ error: 'Ticket no encontrado' });
    if (!targetQueue) return res.status(404).json({ error: 'Bandeja no encontrada' });

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data:  {
        queue_id,
        history: { create: { type: 'queue_move', from_val: existing.queue_id, to_val: queue_id, comment: note, category: 'Reasignación', agent_name: req.user.name } },
      },
      include: TICKET_INCLUDE,
    });

    actionLogger('QUEUE_MOVE', `${req.params.id} ${existing.queue_id} → ${queue_id} por ${req.user.name}`);
    res.json({ ticket: fmt(ticket) });
  } catch (err) { next(err); }
});

// PATCH /api/tickets/:id
router.patch('/:id', requireRole('admin', 'agent'), async (req, res, next) => {
  try {
    const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado' });

    const allowed = ['priority', 'dept', 'category', 'sla_deadline'];
    const data    = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const historyEntries = [];

    if ('assignee_id' in req.body) {
      const aid = req.body.assignee_id;
      if (aid === null || aid === '') {
        data.assignee_id   = null;
        data.assignee_name = null;
        if (existing.assignee_name) {
          historyEntries.push({ type: 'assign', from_val: existing.assignee_name, to_val: '', comment: '', category: 'Reasignación', agent_name: req.user.name });
        }
      } else {
        const user = await prisma.user.findUnique({ where: { id: Number(aid) } });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        data.assignee_id   = user.id;
        data.assignee_name = user.name;
        if (existing.assignee_name !== user.name) {
          historyEntries.push({ type: 'assign', from_val: existing.assignee_name || '', to_val: user.name, comment: '', category: 'Reasignación', agent_name: req.user.name });
        }
      }
    }

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data:  {
        ...data,
        ...(historyEntries.length && { history: { createMany: { data: historyEntries } } }),
      },
      include: TICKET_INCLUDE,
    }).catch(() => null);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    const assignEntry = historyEntries.find(h => h.type === 'assign');
    if (assignEntry) {
      const to = assignEntry.to_val || 'sin asignar';
      actionLogger('ASSIGNED', `${req.params.id} → ${to} por ${req.user.name}`);
    }
    res.json({ ticket: fmt(ticket) });
  } catch (err) { next(err); }
});

export default router;
