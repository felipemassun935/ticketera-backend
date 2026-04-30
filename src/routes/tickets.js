import { Router } from 'express';
import { db, nextTicketId } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const now = () => new Date().toISOString();

function enrichTicket(t, data) {
  const queue = data.queues.find(q => q.id === t.queue_id);
  return {
    ...t,
    queue_name:  queue?.name  || null,
    queue_color: queue?.color || null,
    tags:        data.ticket_tags.filter(tt => tt.ticket_id === t.id).map(tt => tt.tag),
    history:     data.ticket_history.filter(h => h.ticket_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

// GET /api/tickets
router.get('/', async (req, res, next) => {
  try {
    await db.read();
    const { status, queue, assignee, priority, search, page = 1, limit = 200 } = req.query;
    const role = req.user.role;

    let rows = [...db.data.tickets];

    if (role === 'customer')      rows = rows.filter(t => t.requester_email === req.user.email);
    if (status)                   rows = rows.filter(t => t.status === status);
    if (queue)                    rows = rows.filter(t => t.queue_id === queue);
    if (assignee)                 rows = rows.filter(t => t.assignee_name === assignee);
    if (priority)                 rows = rows.filter(t => t.priority === priority);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(t => [t.title, t.id, t.requester_name].join(' ').toLowerCase().includes(q));
    }

    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const total   = rows.length;
    const paged   = rows.slice((page - 1) * Number(limit), page * Number(limit));
    const tickets = paged.map(t => enrichTicket(t, db.data));

    res.json({ tickets, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/tickets/:id
router.get('/:id', async (req, res, next) => {
  try {
    await db.read();
    const t = db.data.tickets.find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (req.user.role === 'customer' && t.requester_email !== req.user.email)
      return res.status(403).json({ error: 'Sin acceso a este ticket' });
    res.json({ ticket: enrichTicket(t, db.data) });
  } catch (err) { next(err); }
});

// POST /api/tickets
router.post('/', async (req, res, next) => {
  try {
    await db.read();
    const { title, queue_id, category, priority = 'medium', description, tags = [], sla_deadline, dept } = req.body;
    if (!title || !queue_id) return res.status(400).json({ error: 'title y queue_id requeridos' });

    const id = nextTicketId();
    const ts = now();
    const ticket = { id, title, requester_name: req.user.name, requester_email: req.user.email, assignee_name: null, queue_id, dept: dept || null, category: category || null, status: 'new', priority, sla_deadline: sla_deadline || null, created_at: ts, updated_at: ts };
    db.data.tickets.push(ticket);
    tags.forEach(tag => db.data.ticket_tags.push({ ticket_id: id, tag }));
    db.data.ticket_history.push({ id: Date.now(), ticket_id: id, type: 'created', from_val: '', to_val: 'new', comment: description || 'Ticket creado.', category: 'Diagnóstico', agent_name: req.user.name, created_at: ts });
    await db.write();

    res.status(201).json({ ticket: enrichTicket(ticket, db.data) });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/update
router.post('/:id/update', requireRole('admin', 'agent'), async (req, res, next) => {
  try {
    await db.read();
    const { comment, status, category = 'Diagnóstico' } = req.body;
    if (!comment?.trim()) return res.status(400).json({ error: 'comment requerido' });

    const idx = db.data.tickets.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Ticket no encontrado' });

    const ticket = db.data.tickets[idx];
    const ts = now();

    if (status && status !== ticket.status) {
      db.data.ticket_history.push({ id: Date.now(), ticket_id: ticket.id, type: 'status_change', from_val: ticket.status, to_val: status, comment: '', category, agent_name: req.user.name, created_at: ts });
      db.data.tickets[idx] = { ...ticket, status, updated_at: ts };
    }

    db.data.ticket_history.push({ id: Date.now() + 1, ticket_id: ticket.id, type: 'comment', from_val: '', to_val: '', comment, category, agent_name: req.user.name, created_at: ts });
    db.data.tickets[idx] = { ...db.data.tickets[idx], updated_at: ts };
    await db.write();

    res.json({ ticket: enrichTicket(db.data.tickets[idx], db.data) });
  } catch (err) { next(err); }
});

// POST /api/tickets/:id/move
router.post('/:id/move', requireRole('admin', 'agent'), async (req, res, next) => {
  try {
    await db.read();
    const { queue_id, note = '' } = req.body;
    if (!queue_id) return res.status(400).json({ error: 'queue_id requerido' });

    const idx = db.data.tickets.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (!db.data.queues.find(q => q.id === queue_id)) return res.status(404).json({ error: 'Bandeja no encontrada' });

    const ticket = db.data.tickets[idx];
    const ts = now();
    db.data.ticket_history.push({ id: Date.now(), ticket_id: ticket.id, type: 'queue_move', from_val: ticket.queue_id, to_val: queue_id, comment: note, category: 'Reasignación', agent_name: req.user.name, created_at: ts });
    db.data.tickets[idx] = { ...ticket, queue_id, updated_at: ts };
    await db.write();

    res.json({ ticket: enrichTicket(db.data.tickets[idx], db.data) });
  } catch (err) { next(err); }
});

// PATCH /api/tickets/:id
router.patch('/:id', requireRole('admin', 'agent'), async (req, res, next) => {
  try {
    await db.read();
    const idx = db.data.tickets.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Ticket no encontrado' });

    const allowed = ['assignee_name', 'priority', 'dept', 'category', 'sla_deadline'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    db.data.tickets[idx] = { ...db.data.tickets[idx], ...updates, updated_at: now() };
    await db.write();

    res.json({ ticket: enrichTicket(db.data.tickets[idx], db.data) });
  } catch (err) { next(err); }
});

export default router;
