import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role_id: u.role_id, role_label: u.role?.label, role_color: u.role?.color, active: u.active, created_at: u.created_at, updated_at: u.updated_at };
}

const USER_INCLUDE = { role: { select: { label: true, color: true } } };

router.get('/', async (req, res, next) => {
  try {
    const { role, search } = req.query;
    const where = {};
    if (role) where.role_id = role;
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const users = await prisma.user.findMany({ where, include: USER_INCLUDE });
    res.json({ users: users.map(publicUser) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, password = 'equilybrio2026', role = 'agent' } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name y email requeridos' });

    const roleExists = await prisma.role.findUnique({ where: { id: role } });
    if (!roleExists) return res.status(400).json({ error: 'Rol inválido' });

    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase(), password_hash: bcrypt.hashSync(password, 10), role_id: role, active: true },
      include: USER_INCLUDE,
    }).catch(e => {
      if (e.code === 'P2002') throw Object.assign(new Error('El email ya está registrado'), { status: 409 });
      throw e;
    });

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, email, role, password } = req.body;

    if (role) {
      const roleExists = await prisma.role.findUnique({ where: { id: role } });
      if (!roleExists) return res.status(400).json({ error: 'Rol inválido' });
    }

    const data = {
      ...(name     && { name }),
      ...(email    && { email: email.toLowerCase() }),
      ...(role     && { role_id: role }),
      ...(password && { password_hash: bcrypt.hashSync(password, 10) }),
    };

    const user = await prisma.user.update({ where: { id }, data, include: USER_INCLUDE })
      .catch(e => {
        if (e.code === 'P2025') throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
        if (e.code === 'P2002') throw Object.assign(new Error('El email ya está en uso'), { status: 409 });
        throw e;
      });

    res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'No podés desactivarte a vos mismo' });

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = await prisma.user.update({ where: { id }, data: { active: !existing.active }, include: USER_INCLUDE });
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });

    await prisma.user.delete({ where: { id } }).catch(e => {
      if (e.code === 'P2025') throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
      throw e;
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
