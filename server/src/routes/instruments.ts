import express, { Router } from 'express';
import { Database } from '../db/database.js';

export function instrumentRoutes(db: Database): Router {
  const router = express.Router();

  // Get all instruments
  router.get('/', async (req, res) => {
    try {
      const instruments = await db.all(`SELECT * FROM instruments ORDER BY name`);
      res.json(instruments);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Create instrument
  router.post('/', async (req, res) => {
    try {
      const { name, type, pointValue } = req.body;
      const result = await db.run(
        `INSERT INTO instruments (name, type, pointValue) VALUES (?, ?, ?)`,
        [name, type, pointValue]
      );
      res.json({ id: result.lastID, name, type, pointValue });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Update instrument
  router.put('/:id', async (req, res) => {
    try {
      const { name, type, pointValue } = req.body;
      await db.run(
        `UPDATE instruments SET name=?, type=?, pointValue=? WHERE id=?`,
        [name, type, pointValue, req.params.id]
      );
      res.json({ id: req.params.id, name, type, pointValue });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Delete instrument
  router.delete('/:id', async (req, res) => {
    try {
      const trade = await db.get(`SELECT COUNT(*) as c FROM trades WHERE instrumentId = ?`, [req.params.id]);
      if (trade && trade.c > 0) {
        return res.status(409).json({ error: `This instrument has ${trade.c} trade(s) attached. Delete the trades first, or the instrument is kept for historical records.` });
      }
      await db.run(`DELETE FROM instruments WHERE id=?`, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
