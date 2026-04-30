import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, nextUserId } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);
const now = () => new Date().toISOString();

function publicUser(u, roles) {
  const role = roles.find(r => r.id === u.role_id);
  return { id: u.id, name: u.name, email: u.email, role_id: u.role_id, role_label: role?.label, role_color: role?.color, active: u.active, created_at: u.created_at, updated_at: u.updated_at };
}

router.get('/', async (req, res, next) => {
  try {
    await db.read();
    const { role, search } = req.query;
    let users = [...db.data.users];
    if (role)   users = users.filter(u => u.role_id === role);
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u => [u.name, u.email].join(' ').toLowerCase().includes(q));
    }
    res.json({ users: users.map(u => publicUser(u, db.data.roles)) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    await db.read();
    const { name, email, password = 'equilybrio2026', role = 'agent' } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name y email requeridos' });
    if (db.data.users.find(u => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(409).json({ error: 'El email ya está registrado' });
    if (!db.data.roles.find(r => r.id === role))
      return res.status(400).json({ error: 'Rol inválido' });

    const ts = now();
    const user = { id: nextUserId(), name, email, password_hash: bcrypt.hashSync(password, 10), role_id: role, active: true, created_at: ts, updated_at: ts };
    db.data.users.push(user);
    await db.write();
    res.status(201).json({ user: publicUser(user, db.data.roles) });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    await db.read();
    const id  = Number(req.params.id);
    const idx = db.data.users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { name, email, role, password } = req.body;
    if (email) {
      const dup = db.data.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== id);
      if (dup) return res.status(409).json({ error: 'El email ya está en uso' });
    }
    if (role && !db.data.roles.find(r => r.id === role))
      return res.status(400).json({ error: 'Rol inválido' });

    db.data.users[idx] = {
      ...db.data.users[idx],
      ...(name     && { name }),
      ...(email    && { email }),
      ...(role     && { role_id: role }),
      ...(password && { password_hash: bcrypt.hashSync(password, 10) }),
      updated_at: now(),
    };
    await db.write();
    res.json({ user: publicUser(db.data.users[idx], db.data.roles) });
  } catch (err) { next(err); }
});

router.patch('/:id/toggle', async (req, res, next) => {
  try {
    await db.read();
    const id  = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'No podés desactivarte a vos mismo' });
    const idx = db.data.users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
    db.data.users[idx] = { ...db.data.users[idx], active: !db.data.users[idx].active, updated_at: now() };
    await db.write();
    res.json({ user: publicUser(db.data.users[idx], db.data.roles) });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.read();
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
    if (!db.data.users.find(u => u.id === id)) return res.status(404).json({ error: 'Usuario no encontrado' });
    db.data.users = db.data.users.filter(u => u.id !== id);
    await db.write();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
