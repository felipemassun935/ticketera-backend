import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import { initDb } from './src/config/db.js';
import authRoutes    from './src/routes/auth.js';
import ticketRoutes  from './src/routes/tickets.js';
import queueRoutes   from './src/routes/queues.js';
import userRoutes    from './src/routes/users.js';
import roleRoutes    from './src/routes/roles.js';
import kbRoutes      from './src/routes/kb.js';
import slaRoutes     from './src/routes/sla.js';
import { errorHandler, notFound } from './src/middleware/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/tickets',   ticketRoutes);
app.use('/api/queues',    queueRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/roles',     roleRoutes);
app.use('/api/kb',        kbRoutes);
app.use('/api/sla-rules', slaRoutes);

app.get('/api/health', (_, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
);

// ── Error handling ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Ticketera API  →  http://localhost:${PORT}\n`);
  });
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
