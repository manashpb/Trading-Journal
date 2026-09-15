import express, { Router } from 'express';
import { Database } from '../db/database.js';

export function tagRoutes(db: Database): Router {
  const router = express.Router();

  // Get all tag categories with tags
  router.get('/categories', async (req, res) => {
    try {
      const categories = await db.all(`SELECT * FROM tag_categories ORDER BY name`);
      const categoriesWithTags = await Promise.all(
        categories.map(async (cat) => ({
          ...cat,
          tags: await db.all(`SELECT * FROM tags WHERE categoryId = ? ORDER BY name`, [cat.id])
        }))
      );
      res.json(categoriesWithTags);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Create category
  router.post('/categories', async (req, res) => {
    try {
      const { name } = req.body;
      const result = await db.run(
        `INSERT INTO tag_categories (name) VALUES (?)`,
        [name]
      );
      res.json({ id: result.lastID, name });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Create tag
  router.post('/categories/:categoryId/tags', async (req, res) => {
    try {
      const { name } = req.body;
      const result = await db.run(
        `INSERT INTO tags (categoryId, name) VALUES (?, ?)`,
        [req.params.categoryId, name]
      );
      res.json({ id: result.lastID, categoryId: req.params.categoryId, name });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Delete tag
  router.delete('/tags/:id', async (req, res) => {
    try {
      await db.run(`DELETE FROM trade_tags WHERE tagId=?`, [req.params.id]);
      await db.run(`DELETE FROM tags WHERE id=?`, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Delete category
  router.delete('/categories/:id', async (req, res) => {
    try {
      const tags = await db.all(`SELECT id FROM tags WHERE categoryId=?`, [req.params.id]);
      for (const tag of tags) {
        await db.run(`DELETE FROM trade_tags WHERE tagId=?`, [tag.id]);
      }
      await db.run(`DELETE FROM tags WHERE categoryId=?`, [req.params.id]);
      await db.run(`DELETE FROM tag_categories WHERE id=?`, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
