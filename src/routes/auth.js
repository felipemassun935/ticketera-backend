import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';
import { db } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña requeridos' });

    await db.read();
    const user = db.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    if (!user.active)
      return res.status(403).json({ error: 'Usuario desactivado' });

    const role = db.data.roles.find(r => r.id === user.role_id);
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

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    await db.read();
    const user = db.data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const role = db.data.roles.find(r => r.id === user.role_id);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role_id, role_label: role?.label, active: user.active } });
  } catch (err) { next(err); }
});

export default router;
