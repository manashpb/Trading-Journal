import express, { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Database } from '../db/database.js';

interface MulterReq extends Request {
  dirPath?: string;
  fileCount?: number;
}

export function tradeRoutes(db: Database): Router {
  const router = express.Router();

  // ── Helpers ─────────────────────────────────────────────
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const snapshotsRoot = path.resolve(__dirname, '..', '..', 'snapshots');

  function calcPnl(direction: string, entry: number, exit: number, qty: number, pointValue: number): number {
    const signed = direction === 'Long' ? exit - entry : entry - exit;
    return Math.round(signed * qty * pointValue * 100) / 100;
  }

  function tradeMapper(t: any): any {
    const snaps = t.snapshots || [];
    return {
      ...t,
      tags: (t.tagIds ? String(t.tagIds).split(',') : []).map(Number),
      tagNames: t.tagNames ? String(t.tagNames).split(',') : [],
      snapshots: snaps,
      snapshotPaths: t.snapshotPaths
        ? String(t.snapshotPaths).split(',')
        : snaps.map((s: any) => s.filePath),
      firstSnapshot: t.firstSnapshot ?? snaps[0]?.filePath ?? null,
    };
  }

  // ── List / filter ───────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const { startDate, endDate, status, contractType, instrumentId } = req.query;
      let sql = `
        SELECT t.*, i.name as instrumentName, i.pointValue,
          (SELECT GROUP_CONCAT(tg.id) FROM trade_tags tt JOIN tags tg ON tt.tagId = tg.id WHERE tt.tradeId = t.id) as tagIds,
          (SELECT GROUP_CONCAT(tg.name) FROM trade_tags tt JOIN tags tg ON tt.tagId = tg.id WHERE tt.tradeId = t.id) as tagNames,
          (SELECT GROUP_CONCAT(s.filePath) FROM trade_snapshots s WHERE s.tradeId = t.id) as snapshotPaths,
          (SELECT s.filePath FROM trade_snapshots s WHERE s.tradeId = t.id ORDER BY s.filePath LIMIT 1) as firstSnapshot,
          (SELECT COUNT(*) FROM trade_snapshots s WHERE s.tradeId = t.id) as snapshotCount
        FROM trades t
        LEFT JOIN instruments i ON t.instrumentId = i.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (startDate) { sql += ` AND date(t.entryDateTime) >= date(?)`; params.push(startDate); }
      if (endDate) { sql += ` AND date(t.entryDateTime) <= date(?)`; params.push(endDate); }
      if (status) { sql += ` AND t.status = ?`; params.push(status); }
      if (contractType) { sql += ` AND t.contractType = ?`; params.push(contractType); }
      if (instrumentId) { sql += ` AND t.instrumentId = ?`; params.push(instrumentId); }
      sql += ` ORDER BY t.entryDateTime DESC`;

      const rows = await db.all(sql, params);
      res.json(rows.map(tradeMapper));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Single trade ────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const trade = await db.get(`
        SELECT t.*, i.name as instrumentName, i.pointValue
        FROM trades t LEFT JOIN instruments i ON t.instrumentId = i.id
        WHERE t.id = ?`, [req.params.id]);
      if (!trade) return res.status(404).json({ error: 'Trade not found' });
      const snapshots = await db.all(`SELECT * FROM trade_snapshots WHERE tradeId = ? ORDER BY filePath`, [req.params.id]);
      res.json(tradeMapper({ ...trade, snapshots }));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Create ──────────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const { instrumentId, direction, contractType, entryDateTime, entryPrice, slPrice, targetPrice, quantity, exitDateTime, exitPrice, status, comments, tags } = req.body;
      const inst = await db.get(`SELECT * FROM instruments WHERE id = ?`, [instrumentId]);
      if (!inst) return res.status(400).json({ error: 'Invalid instrument' });

      const isClosed = status === 'Closed' && exitPrice != null;
      const pnl = isClosed ? calcPnl(direction, entryPrice, exitPrice, quantity, inst.pointValue) : null;

      const result = await db.run(
        `INSERT INTO trades (instrumentId, direction, contractType, entryDateTime, entryPrice, slPrice, targetPrice, quantity, exitDateTime, exitPrice, status, pnl, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [instrumentId, direction, contractType, entryDateTime, entryPrice, slPrice ?? null, targetPrice ?? null, quantity, exitDateTime ?? null, exitPrice ?? null, status || 'Open', pnl, comments ?? null]
      );

      if (Array.isArray(tags) && tags.length) {
        for (const tagId of tags) {
          await db.run(`INSERT INTO trade_tags (tradeId, tagId) VALUES (?, ?)`, [result.lastID, tagId]);
        }
      }

      res.json({ id: result.lastID });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Update ──────────────────────────────────────────────
  router.put('/:id', async (req, res) => {
    try {
      const { instrumentId, direction, contractType, entryDateTime, entryPrice, slPrice, targetPrice, quantity, exitDateTime, exitPrice, status, comments, tags } = req.body;
      const inst = await db.get(`SELECT * FROM instruments WHERE id = ?`, [instrumentId]);
      if (!inst) return res.status(400).json({ error: 'Invalid instrument' });

      const isClosed = status === 'Closed' && exitPrice != null;
      const pnl = isClosed ? calcPnl(direction, entryPrice, exitPrice, quantity, inst.pointValue) : null;

      await db.run(
        `UPDATE trades SET instrumentId=?, direction=?, contractType=?, entryDateTime=?, entryPrice=?, slPrice=?, targetPrice=?, quantity=?, exitDateTime=?, exitPrice=?, status=?, pnl=?, comments=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?`,
        [instrumentId, direction, contractType, entryDateTime, entryPrice, slPrice ?? null, targetPrice ?? null, quantity, exitDateTime ?? null, exitPrice ?? null, status || 'Open', pnl, comments ?? null, req.params.id]
      );

      await db.run(`DELETE FROM trade_tags WHERE tradeId=?`, [req.params.id]);
      if (Array.isArray(tags) && tags.length) {
        for (const tagId of tags) {
          await db.run(`INSERT INTO trade_tags (tradeId, tagId) VALUES (?, ?)`, [req.params.id, tagId]);
        }
      }

      res.json({ id: Number(req.params.id) });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Delete ──────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      const snapshots = await db.all(`SELECT filePath FROM trade_snapshots WHERE tradeId = ?`, [req.params.id]);
      await db.run(`DELETE FROM trades WHERE id=?`, [req.params.id]);
      for (const s of snapshots) {
        const full = path.join(snapshotsRoot, s.filePath);
        fs.rmSync(dirnameSafe(full), { recursive: true, force: true });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Snapshot delete (declared before /:id to avoid capture) ──
  router.delete('/snapshots/:snapshotId', async (req, res) => {
    try {
      const snap = await db.get(`SELECT * FROM trade_snapshots WHERE id = ?`, [req.params.snapshotId]);
      if (!snap) return res.status(404).json({ error: 'Snapshot not found' });
      await db.run(`DELETE FROM trade_snapshots WHERE id=?`, [req.params.snapshotId]);
      const full = path.join(snapshotsRoot, snap.filePath);
      try { fs.unlinkSync(full); } catch {}
      const dir = dirnameSafe(full);
      try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch {}
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Snapshot upload ─────────────────────────────────────
  const storage = multer.diskStorage({
    destination: (req: MulterReq, file, cb) => {
      const tradeId = req.params.id;
      const instName = (req.query.instrumentName as string) || 'trade';
      const entry = (req.query.entry as string) || '';
      const dateStr = entry.slice(0, 10).replace(/-/g, '') || 'nodate';
      const dirName = `${dateStr}_${sanitize(instName)}_${tradeId}`;
      const dir = path.join(snapshotsRoot, dirName);
      fs.mkdirSync(dir, { recursive: true });
      req.dirPath = dir;
      cb(null, dir);
    },
    filename: (req: MulterReq, file, cb) => {
      const count = req.fileCount || 0;
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `img_${String(count + 1).padStart(3, '0')}${ext}`);
    },
  });
  const upload = multer({ storage });

  router.post('/:id/snapshots', (req: MulterReq, res: Response, next: NextFunction) => {
    db.get(`SELECT COUNT(*) as c FROM trade_snapshots WHERE tradeId = ?`, [req.params.id])
      .then(({ c }) => {
        req.fileCount = c;
        next();
      })
      .catch(next);
  }, upload.single('snapshot'), async (req: MulterReq, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const relPath = path.relative(snapshotsRoot, req.file.path).split(path.sep).join('/');
      const result = await db.run(`INSERT INTO trade_snapshots (tradeId, filePath) VALUES (?, ?)`, [req.params.id, relPath]);
      res.json({ id: result.lastID, filePath: relPath });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
function dirnameSafe(p: string): string {
  return path.dirname(p);
}