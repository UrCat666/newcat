import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { attachRealtimeServer } from './server/realtime';
import { createApiRouter } from './server/routes';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Ensure upload directories exist and serve uploaded assets safely
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const qrisUploadsRoot = path.join(uploadsRoot, 'qris');
  fs.mkdirSync(qrisUploadsRoot, { recursive: true });
  app.use(
    '/uploads/qris',
    express.static(qrisUploadsRoot, {
      etag: false,
      lastModified: false,
      maxAge: 0,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      },
    })
  );
  app.use('/uploads', express.static(uploadsRoot, { maxAge: '1d' }));

  // Ensure generated product/banner assets and official QRIS are served in both dev and prod
  const generatedImagesDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
  if (fs.existsSync(generatedImagesDir)) {
    app.use('/src/assets/images', express.static(generatedImagesDir, { maxAge: '7d' }));
  }

  // API endpoints
  app.use('/api', createApiRouter());

  // Explicitly return JSON 404 for unknown API paths
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { maxAge: '1d' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachRealtimeServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Catrizzz Store server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Catrizzz Store server:', err);
  process.exit(1);
});
