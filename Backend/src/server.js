import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/database.js';

import authRoutes from './routes/auth.js';
import citizenRoutes from './routes/citizen.js';
import authorityRoutes from './routes/authority.js';
import workerRoutes from './routes/worker.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'CivicConnect API is running'
  });
});

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

app.use(
  cors({
    origin: env.corsOrigin.split(',').map((s) => s.trim()),
    credentials: false
  })
);

app.use(express.json({ limit: '1mb' }));

app.use(
  express.urlencoded({
    extended: true,
    limit: '1mb'
  })
);

app.use(
  morgan(env.nodeEnv === 'production' ? 'combined' : 'dev')
);

fs.mkdirSync(path.resolve(env.uploadDir), {
  recursive: true
});

app.use(
  '/uploads',
  express.static(path.resolve(env.uploadDir), {
    fallthrough: false,
    maxAge: '1d'
  })
);

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  }),
  authRoutes
);

app.use('/api/citizen', citizenRoutes);
app.use('/api/authority', authorityRoutes);
app.use('/api/worker', workerRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    data: {
      service: 'civicconnect-api',
      database: 'postgresql',
      status: 'healthy',
      time: new Date().toISOString()
    }
  });
});

app.use(notFound);
app.use(errorHandler);

await migrate();

const server = app.listen(env.port, () => {
  console.log(
    `CivicConnect API listening on http://localhost:${env.port}`
  );
});

const shutdown = async () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
