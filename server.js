import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import { prisma }   from './src/config/db.js';
import { runSeed }  from './prisma/seed.js';
import authRoutes   from './src/routes/auth.js';
import ticketRoutes from './src/routes/tickets.js';
import queueRoutes  from './src/routes/queues.js';
import userRoutes   from './src/routes/users.js';
import roleRoutes   from './src/routes/roles.js';
import kbRoutes     from './src/routes/kb.js';
import slaRoutes     from './src/routes/sla.js';
import reportsRoutes from './src/routes/reports.js';
import { errorHandler, notFound } from './src/middleware/errorHandler.js';
import { requestLogger }          from './src/middleware/logger.js';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(requestLogger);

app.use('/api/auth',      authRoutes);
app.use('/api/tickets',   ticketRoutes);
app.use('/api/queues',    queueRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/roles',     roleRoutes);
app.use('/api/kb',        kbRoutes);
app.use('/api/sla-rules', slaRoutes);
app.use('/api/reports',  reportsRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use(notFound);
app.use(errorHandler);

async function start() {
  await prisma.$connect();
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log('  Seeding database...');
    await runSeed();
  }
  console.log('  ✓ Database ready');
  app.listen(PORT, () => console.log(`\n  Ticketera API  →  http://localhost:${PORT}\n`));
}

start().catch(err => { console.error('Startup failed:', err); process.exit(1); });
