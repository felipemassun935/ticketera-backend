import { Router } from 'express';
import { db } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const ALL_PERMS = ['viewAllQueues','manageTickets','manageQueues','manageUsers','manageRoles','viewReports','manageSLA','viewKB','manageKB','accessAdmin'];

function enrichRole(r, data) {
  const perms = data.role_permissions.filter(p => p.role_id === r.id);
  return {
    ...r,
    permissions: Object.fromEntries(ALL_PERMS.map(p => [p, perms.find(x => x.permission_id === p)?.enabled ?? false])),
    user_count:  data.users.filter(u => u.role_id === r.id && u.active).length,
  };
}

router.get('/', async (req, res, next) => {
  try {
    await db.read();
    res.json({ roles: db.data.roles.map(r => enrichRole(r, db.data)) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    await db.read();
    const role = db.data.roles.find(r => r.id === req.params.id);
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
    res.json({ role: enrichRole(role, db.data) });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const { id, label, description = '', color = '#888888', permissions = {} } = req.body;
    if (!id || !label) return res.status(400).json({ error: 'id y label requeridos' });
    if (db.data.roles.find(r => r.id === id)) return res.status(409).json({ error: `Ya existe el rol "${id}"` });

    db.data.roles.push({ id, label, description, color, editable: true, created_at: new Date().toISOString() });
    ALL_PERMS.forEach(p => db.data.role_permissions.push({ role_id: id, permission_id: p, enabled: !!permissions[p] }));
    await db.write();
    res.status(201).json({ role: enrichRole(db.data.roles.at(-1), db.data) });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const idx = db.data.roles.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Rol no encontrado' });

    const role = db.data.roles[idx];
    const { label, description, color, permissions } = req.body;
    db.data.roles[idx] = { ...role, ...(label && { label }), ...(description !== undefined && { description }), ...(color && { color }) };

    if (permissions && role.editable) {
      Object.entries(permissions).forEach(([p, v]) => {
        const pi = db.data.role_permissions.findIndex(x => x.role_id === role.id && x.permission_id === p);
        if (pi !== -1) db.data.role_permissions[pi] = { ...db.data.role_permissions[pi], enabled: !!v };
      });
    }

    await db.write();
    res.json({ role: enrichRole(db.data.roles[idx], db.data) });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.read();
    const role = db.data.roles.find(r => r.id === req.params.id);
    if (!role)          return res.status(404).json({ error: 'Rol no encontrado' });
    if (!role.editable) return res.status(400).json({ error: 'Los roles del sistema no se pueden eliminar' });
    const usersWithRole = db.data.users.filter(u => u.role_id === req.params.id).length;
    if (usersWithRole > 0) return res.status(409).json({ error: `Hay ${usersWithRole} usuarios con este rol` });
    db.data.roles            = db.data.roles.filter(r => r.id !== req.params.id);
    db.data.role_permissions = db.data.role_permissions.filter(p => p.role_id !== req.params.id);
    await db.write();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
