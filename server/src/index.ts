import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from './db/database.js';
import { tradeRoutes } from './routes/trades.js';
import { instrumentRoutes } from './routes/instruments.js';
import { frameworkRoutes } from './routes/framework.js';
import { tagRoutes } from './routes/tags.js';
import { timingSafeEqual } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

const username = process.env.JOURNAL_USER;
const password = process.env.JOURNAL_PASSWORD;
if (process.env.NODE_ENV === 'production' && (!username || !password)) {
  throw new Error('Set JOURNAL_USER and JOURNAL_PASSWORD before starting production');
}
app.use((req, res, next) => {
  if (!username || !password || req.path === '/api/health') return next();
  const expected = Buffer.from(`${username}:${password}`);
  const actual = Buffer.from(req.headers.authorization?.startsWith('Basic ') ? req.headers.authorization.slice(6) : '', 'base64');
  if (actual.length === expected.length && timingSafeEqual(actual, expected)) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Trading Journal"');
  res.status(401).send('Authentication required');
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Static files for snapshots
const snapshotsDir = process.env.SNAPSHOTS_DIR || path.join(__dirname, '..', 'snapshots');
app.use('/snapshots', express.static(snapshotsDir));

// Initialize database
const db = new Database();
await db.initialize();

// Routes
app.use('/api/trades', tradeRoutes(db));
app.use('/api/instruments', instrumentRoutes(db));
app.use('/api/tags', tagRoutes(db));

app.use('/api/profiles', frameworkRoutes(db));
const clientDir = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/snapshots/')) return next();
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status((err as any).status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Trading Journal Server running on port ${PORT}`);
});
