import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();
const adminRouter = Router();

const VALID_STATUS = new Set(['pending', 'approved', 'rejected']);

function toDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function monthRange(month, year) {
  const now = new Date();
  const y = Number(year) || now.getUTCFullYear();
  const m = Number(month) || now.getUTCMonth() + 1;
  if (m < 1 || m > 12) return null;
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
    month: m,
    year: y,
  };
}

function fmt(entry) {
  return {
    ...entry,
    date: isoDate(entry.date),
    hours: Number(entry.hours),
    project_name: entry.project?.name ?? null,
    project_color: entry.project?.color ?? null,
    user_name: entry.user?.name ?? null,
    user_email: entry.user?.email ?? null,
    reviewer_name: entry.reviewer?.name ?? null,
  };
}

const HOUR_INCLUDE = {
  project: { select: { id: true, name: true, color: true } },
  user: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true, email: true } },
};

function validateHoursPayload({ date, project_id, hours, description }) {
  const entryDate = toDateOnly(date);
  const amount = Number(hours);
  if (!entryDate) return 'Fecha requerida o inválida';
  if (!project_id) return 'Proyecto requerido';
  if (!description?.trim()) return 'Descripción requerida';
  if (!Number.isFinite(amount) || amount < 0.25 || amount > 24) return 'Las horas deben estar entre 0.25 y 24';
  if (Math.abs(amount * 4 - Math.round(amount * 4)) > 0.0001) return 'Las horas deben cargarse en incrementos de 0.25';
  return null;
}

router.use(requireAuth);
adminRouter.use(requireAuth, requireAdmin);

// GET /api/hours
router.get('/', async (req, res, next) => {
  try {
    const range = monthRange(req.query.month, req.query.year);
    if (!range) return res.status(400).json({ error: 'Mes inválido' });
    const { status, project_id, page = 1, limit = 100 } = req.query;
    const where = {
      user_id: req.user.id,
      date: { gte: range.start, lt: range.end },
      ...(status && VALID_STATUS.has(status) && { status }),
      ...(project_id && { project_id }),
    };
    const take = Math.min(Number(limit) || 100, 500);
    const skip = Math.max(Number(page) - 1, 0) * take;

    const [total, entries] = await Promise.all([
      prisma.hourEntry.count({ where }),
      prisma.hourEntry.findMany({
        where,
        include: HOUR_INCLUDE,
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        skip,
        take,
      }),
    ]);
    res.json({ entries: entries.map(fmt), total, page: Number(page), limit: take });
  } catch (err) { next(err); }
});

// POST /api/hours
router.post('/', async (req, res, next) => {
  try {
    const error = validateHoursPayload(req.body);
    if (error) return res.status(400).json({ error });

    const entryDate = toDateOnly(req.body.date);
    const hours = Number(req.body.hours);
    const project = await prisma.queue.findFirst({ where: { id: req.body.project_id, active: true } });
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado o inactivo' });

    const existing = await prisma.hourEntry.aggregate({
      where: { user_id: req.user.id, date: entryDate },
      _sum: { hours: true },
    });
    const currentTotal = Number(existing._sum.hours || 0);
    if (currentTotal + hours > 24) {
      return res.status(400).json({ error: `No podés superar 24 horas en el día. Ya cargaste ${currentTotal.toFixed(2)} h.` });
    }

    const entry = await prisma.hourEntry.create({
      data: {
        user_id: req.user.id,
        project_id: req.body.project_id,
        date: entryDate,
        hours,
        description: req.body.description.trim(),
        status: 'pending',
      },
      include: HOUR_INCLUDE,
    });
    res.status(201).json({ entry: fmt(entry) });
  } catch (err) { next(err); }
});

// GET /api/hours/stats
router.get('/stats', async (req, res, next) => {
  try {
    const range = monthRange(req.query.month, req.query.year);
    if (!range) return res.status(400).json({ error: 'Mes inválido' });
    const where = { user_id: req.user.id, date: { gte: range.start, lt: range.end } };
    const entries = await prisma.hourEntry.findMany({ where, include: { project: { select: { id: true, name: true, color: true } } } });
    res.json({ stats: buildStats(entries, range) });
  } catch (err) { next(err); }
});

// GET /api/admin/hours
adminRouter.get('/', async (req, res, next) => {
  try {
    const range = monthRange(req.query.month, req.query.year);
    const { user_id, project_id, status, page = 1, limit = 200 } = req.query;
    const where = {
      ...(range && { date: { gte: range.start, lt: range.end } }),
      ...(user_id && { user_id: Number(user_id) }),
      ...(project_id && { project_id }),
      ...(status && status !== 'all' && VALID_STATUS.has(status) && { status }),
    };
    const take = Math.min(Number(limit) || 200, 500);
    const skip = Math.max(Number(page) - 1, 0) * take;
    const [total, entries] = await Promise.all([
      prisma.hourEntry.count({ where }),
      prisma.hourEntry.findMany({
        where,
        include: HOUR_INCLUDE,
        orderBy: [{ status: 'asc' }, { date: 'desc' }, { created_at: 'desc' }],
        skip,
        take,
      }),
    ]);
    res.json({ entries: entries.map(fmt), total, page: Number(page), limit: take });
  } catch (err) { next(err); }
});

async function reviewEntry(req, res, next, status) {
  try {
    const data = {
      status,
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
      rejection_comment: status === 'rejected' ? (req.body?.comment?.trim() || null) : null,
    };
    const entry = await prisma.hourEntry.update({
      where: { id: Number(req.params.id) },
      data,
      include: HOUR_INCLUDE,
    }).catch(e => {
      if (e.code === 'P2025') return null;
      throw e;
    });
    if (!entry) return res.status(404).json({ error: 'Registro de horas no encontrado' });
    res.json({ entry: fmt(entry) });
  } catch (err) { next(err); }
}

// PATCH /api/admin/hours/:id/approve
adminRouter.patch('/:id/approve', (req, res, next) => reviewEntry(req, res, next, 'approved'));

// PATCH /api/admin/hours/:id/reject
adminRouter.patch('/:id/reject', (req, res, next) => reviewEntry(req, res, next, 'rejected'));

function buildStats(entries, range) {
  const totals = {
    total_hours: 0,
    approved_hours: 0,
    pending_hours: 0,
    rejected_hours: 0,
  };
  const byProject = new Map();
  const byDay = new Map();

  for (const entry of entries) {
    const hours = Number(entry.hours);
    totals.total_hours += hours;
    if (entry.status === 'approved') totals.approved_hours += hours;
    if (entry.status === 'pending') totals.pending_hours += hours;
    if (entry.status === 'rejected') totals.rejected_hours += hours;

    const project = byProject.get(entry.project_id) || {
      project_id: entry.project_id,
      project_name: entry.project?.name ?? entry.project_id,
      project_color: entry.project?.color ?? '#888888',
      hours: 0,
    };
    project.hours += hours;
    byProject.set(entry.project_id, project);

    const day = isoDate(entry.date);
    byDay.set(day, (byDay.get(day) || 0) + hours);
  }

  const topDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const daysWithEntries = byDay.size || 1;
  return {
    period: { month: range.month, year: range.year },
    total_hours: Number(totals.total_hours.toFixed(2)),
    approved_hours: Number(totals.approved_hours.toFixed(2)),
    pending_hours: Number(totals.pending_hours.toFixed(2)),
    rejected_hours: Number(totals.rejected_hours.toFixed(2)),
    approved_rate: totals.total_hours ? Math.round((totals.approved_hours / totals.total_hours) * 100) : 0,
    average_daily_hours: Number((totals.total_hours / daysWithEntries).toFixed(2)),
    top_day: topDay ? { date: topDay[0], hours: Number(topDay[1].toFixed(2)) } : null,
    by_project: [...byProject.values()].map(p => ({ ...p, hours: Number(p.hours.toFixed(2)) })),
  };
}

export { adminRouter as adminHoursRouter };
export default router;
