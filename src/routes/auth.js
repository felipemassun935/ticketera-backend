import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    if (!user.active)
      return res.status(403).json({ error: 'Usuario desactivado' });

    const role  = await prisma.role.findUnique({ where: { id: user.role_id } });
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role_id, role_label: role?.label },
    });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where:   { id: req.user.id },
      include: { role: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role_id, role_label: user.role?.label, active: user.active } });
  } catch (err) { next(err); }
});

export default router;
