import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from './db/database.js';
import { tradeRoutes } from './routes/trades.js';
import { instrumentRoutes } from './routes/instruments.js';
import { tagRoutes } from './routes/tags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Static files for snapshots
const snapshotsDir = path.join(__dirname, '..', 'snapshots');
app.use('/snapshots', express.static(snapshotsDir));

// Initialize database
const db = new Database();
db.initialize();

// Routes
app.use('/api/trades', tradeRoutes(db));
app.use('/api/instruments', instrumentRoutes(db));
app.use('/api/tags', tagRoutes(db));

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Trading Journal Server running on port ${PORT}`);
});
