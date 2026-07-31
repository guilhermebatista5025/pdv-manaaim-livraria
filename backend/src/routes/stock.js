const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/movements', (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 300);
    const movements = db.prepare(`
      SELECT sm.*, p.name AS product_name, p.sku, u.name AS user_name
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      LEFT JOIN users u ON u.id = sm.user_id
      ORDER BY sm.id DESC
      LIMIT ?
    `).all(limit);
    res.json({ movements });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', requireRole('admin', 'owner'), (req, res, next) => {
  try {
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS products_count,
        COALESCE(SUM(stock_quantity), 0) AS total_units,
        COALESCE(SUM(stock_quantity * cost_cents), 0) AS inventory_cost_cents,
        SUM(CASE WHEN stock_quantity <= minimum_stock THEN 1 ELSE 0 END) AS low_stock_count
      FROM products
      WHERE active = 1
    `).get();
    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
