import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';

import { initSocket } from './server/socket';
import authRouter from './server/routes/auth';
import superadminRouter from './server/routes/superadmin';
import tenantRouter from './server/routes/tenant';

// Initialize environment variables from .env
dotenv.config();

const app = express();
const httpServer = createHttpServer(app);

// Initialize Socket.io
initSocket(httpServer);

const PORT = Number(process.env.PORT) || 5000;

// Set up server-side JSON and Form data limit (generous for base-64 bill images)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Disable caching for all API responses to ensure stats are always up-to-date and live
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/superadmin', superadminRouter);
app.use('/api', tenantRouter);

// Vite server mount for handling development asset pipeline & production static routing
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ERP custom fullstack server running on http://0.0.0.0:${PORT}`);
  });
}

initServer().catch((err) => {
  console.error("Failed to start fullstack server", err);
});
