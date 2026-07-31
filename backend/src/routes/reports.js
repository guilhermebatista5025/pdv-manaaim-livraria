const express = require('express');
const { db } = require('../database');
const { requireRole } = require('../middleware');

const router = express.Router();
router.use(requireRole('admin', 'owner'));

router.get('/summary', (req, res, next) => {
  try {
    const period = String(req.query.period || 'today');
    const currentSessionOnly = req.query.scope === 'current';
    const modifiers = {
      today: 'start of day',
      week: '-6 days',
      month: 'start of month'
    };
    const modifier = modifiers[period];
    if (!modifier) return res.status(400).json({ error: 'Período inválido.' });
    const currentSession = currentSessionOnly
      ? db.prepare(`SELECT id FROM cash_sessions WHERE status = 'open'`).get()
      : null;
    const sessionId = currentSessionOnly ? (currentSession?.id || -1) : null;

    const sales = db.prepare(`
      SELECT
        COUNT(*) AS sales_count,
        COALESCE(SUM(total_cents), 0) AS revenue_cents,
        COALESCE(SUM(discount_cents), 0) AS discounts_cents
      FROM sales
      WHERE status = 'completed'
        AND datetime(created_at, 'localtime') >= datetime('now', 'localtime', ?)
        AND (? IS NULL OR cash_session_id = ?)
    `).get(modifier, sessionId, sessionId);

    const products = db.prepare(`
      SELECT
        COALESCE(SUM(si.quantity), 0) AS items_sold,
        COALESCE(SUM((si.unit_price_cents - si.unit_cost_cents) * si.quantity), 0) AS gross_profit_cents
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'completed'
        AND datetime(s.created_at, 'localtime') >= datetime('now', 'localtime', ?)
        AND (? IS NULL OR s.cash_session_id = ?)
    `).get(modifier, sessionId, sessionId);

    const lowStock = db.prepare(`
      SELECT id, name, sku, stock_quantity, minimum_stock
      FROM products
      WHERE active = 1 AND stock_quantity <= minimum_stock
      ORDER BY stock_quantity ASC, name
      LIMIT 20
    `).all();

    const topProducts = db.prepare(`
      SELECT si.product_id, si.product_name, SUM(si.quantity) AS quantity,
             SUM(si.total_cents) AS revenue_cents
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'completed'
        AND datetime(s.created_at, 'localtime') >= datetime('now', 'localtime', ?)
        AND (? IS NULL OR s.cash_session_id = ?)
      GROUP BY si.product_id, si.product_name
      ORDER BY quantity DESC, revenue_cents DESC
      LIMIT 10
    `).all(modifier, sessionId, sessionId);

    res.json({
      period,
      summary: { ...sales, ...products },
      lowStock,
      topProducts
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
