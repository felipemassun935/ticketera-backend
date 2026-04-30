import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const ALL_PERMS = ['viewAllQueues','manageTickets','manageQueues','manageUsers','manageRoles','viewReports','manageSLA','viewKB','manageKB','accessAdmin'];

function fmt({ permissions, users, ...r }) {
  return {
    ...r,
    permissions: Object.fromEntries(ALL_PERMS.map(p => [p, permissions.find(x => x.permission_id === p)?.enabled ?? false])),
    user_count: users.length,
  };
}

const ROLE_INCLUDE = {
  permissions: true,
  users: { where: { active: true }, select: { id: true } },
};

router.get('/', async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({ include: ROLE_INCLUDE });
    res.json({ roles: roles.map(fmt) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: ROLE_INCLUDE });
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
    res.json({ role: fmt(role) });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { id, label, description = '', color = '#888888', permissions = {} } = req.body;
    if (!id || !label) return res.status(400).json({ error: 'id y label requeridos' });

    const role = await prisma.role.create({
      data: {
        id, label, description, color, editable: true,
        permissions: { createMany: { data: ALL_PERMS.map(p => ({ permission_id: p, enabled: !!permissions[p] })) } },
      },
      include: ROLE_INCLUDE,
    }).catch(e => {
      if (e.code === 'P2002') throw Object.assign(new Error(`Ya existe el rol "${id}"`), { status: 409 });
      throw e;
    });

    res.status(201).json({ role: fmt(role) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Rol no encontrado' });

    const { label, description, color, permissions } = req.body;
    const data = {
      ...(label                    && { label }),
      ...(description !== undefined && { description }),
      ...(color                    && { color }),
    };

    if (permissions && existing.editable) {
      await Promise.all(
        Object.entries(permissions).map(([p, v]) =>
          prisma.rolePermission.updateMany({
            where: { role_id: existing.id, permission_id: p },
            data:  { enabled: !!v },
          })
        )
      );
    }

    const role = await prisma.role.update({ where: { id: req.params.id }, data, include: ROLE_INCLUDE });
    res.json({ role: fmt(role) });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: { users: { select: { id: true } } } });
    if (!role)          return res.status(404).json({ error: 'Rol no encontrado' });
    if (!role.editable) return res.status(400).json({ error: 'Los roles del sistema no se pueden eliminar' });
    if (role.users.length > 0) return res.status(409).json({ error: `Hay ${role.users.length} usuarios con este rol` });

    await prisma.role.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
