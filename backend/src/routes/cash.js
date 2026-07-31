const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../middleware');
const { generateCashReport } = require('../cash-report');

const router = express.Router();
const reportsDirectory = path.resolve(__dirname, '..', '..', 'reports');
fs.mkdirSync(reportsDirectory, { recursive: true });
router.use(requireAuth);

function sessionDetails(id) {
  return db.prepare(`
    SELECT cs.*, opener.name AS opened_by_name, closer.name AS closed_by_name
    FROM cash_sessions cs
    JOIN users opener ON opener.id = cs.opened_by
    LEFT JOIN users closer ON closer.id = cs.closed_by
    WHERE cs.id = ?
  `).get(id);
}

router.get('/status', (req, res) => {
  const session = db.prepare(`
    SELECT cs.*, u.name AS opened_by_name,
      CASE
        WHEN date(cs.opened_at, 'localtime') < date('now', 'localtime') THEN 1
        ELSE 0
      END AS is_stale
    FROM cash_sessions cs
    JOIN users u ON u.id = cs.opened_by
    WHERE cs.status = 'open'
  `).get();
  res.json({ isOpen: Boolean(session), session: session || null });
});

router.get('/history', requireRole('admin', 'owner'), (req, res) => {
  const sessions = db.prepare(`
    SELECT cs.*, opener.name AS opened_by_name, closer.name AS closed_by_name
    FROM cash_sessions cs
    JOIN users opener ON opener.id = cs.opened_by
    LEFT JOIN users closer ON closer.id = cs.closed_by
    ORDER BY cs.id DESC
    LIMIT 100
  `).all();
  res.json({ sessions });
});

router.post('/open', requireRole('admin', 'owner'), (req, res, next) => {
  try {
    const openingAmountCents = Number(req.body?.openingAmountCents ?? 0);
    if (!Number.isInteger(openingAmountCents) || openingAmountCents < 0) {
      return res.status(400).json({ error: 'Valor inicial inválido.' });
    }
    const result = db.prepare(`
      INSERT INTO cash_sessions (opened_by, opening_amount_cents)
      VALUES (?, ?)
    `).run(req.session.user.id, openingAmountCents);
    res.status(201).json({ session: sessionDetails(result.lastInsertRowid) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Já existe um caixa aberto.' });
    }
    next(error);
  }
});

router.post('/close', requireRole('admin', 'owner'), async (req, res, next) => {
  let closedSessionId;
  try {
    const close = db.transaction(() => {
      const current = db.prepare(`SELECT * FROM cash_sessions WHERE status = 'open'`).get();
      if (!current) return null;
      const summary = db.prepare(`
        SELECT
          COUNT(*) AS sales_count,
          COALESCE(SUM(total_cents), 0) AS revenue_cents,
          COALESCE(SUM(discount_cents), 0) AS discounts_cents
        FROM sales
        WHERE cash_session_id = ? AND status = 'completed'
      `).get(current.id);
      const items = db.prepare(`
        SELECT
          COALESCE(SUM(si.quantity), 0) AS items_sold,
          COALESCE(SUM((si.unit_price_cents - si.unit_cost_cents) * si.quantity), 0) AS gross_profit_cents
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.cash_session_id = ? AND s.status = 'completed'
      `).get(current.id);
      db.prepare(`
        UPDATE cash_sessions SET
          status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP,
          closing_notes = ?, sales_count = ?, items_sold = ?,
          revenue_cents = ?, discounts_cents = ?, gross_profit_cents = ?
        WHERE id = ?
      `).run(
        req.session.user.id,
        String(req.body?.notes || '').trim() || null,
        summary.sales_count,
        items.items_sold,
        summary.revenue_cents,
        summary.discounts_cents,
        items.gross_profit_cents,
        current.id
      );
      return current.id;
    });

    closedSessionId = close();
    if (!closedSessionId) return res.status(409).json({ error: 'Não existe caixa aberto.' });

    const session = sessionDetails(closedSessionId);
    const payments = db.prepare(`
      SELECT payment_method, COUNT(*) AS sales_count, SUM(total_cents) AS total_cents
      FROM sales
      WHERE cash_session_id = ? AND status = 'completed'
      GROUP BY payment_method
      ORDER BY total_cents DESC
    `).all(closedSessionId);
    const products = db.prepare(`
      SELECT si.product_name, SUM(si.quantity) AS quantity, SUM(si.total_cents) AS revenue_cents
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.cash_session_id = ? AND s.status = 'completed'
      GROUP BY si.product_id, si.product_name
      ORDER BY quantity DESC, revenue_cents DESC
    `).all(closedSessionId);

    const pdf = await generateCashReport({ session, payments, products });
    const reportName = `fechamento-caixa-${closedSessionId}.pdf`;
    const reportPath = path.join(reportsDirectory, reportName);
    fs.writeFileSync(reportPath, pdf);
    db.prepare('UPDATE cash_sessions SET report_path = ? WHERE id = ?')
      .run(reportName, closedSessionId);

    res.json({
      session: sessionDetails(closedSessionId),
      reportUrl: `/api/cash/${closedSessionId}/report`
    });
  } catch (error) {
    if (closedSessionId) {
      db.prepare(`
        UPDATE cash_sessions SET status = 'open', closed_by = NULL, closed_at = NULL,
          closing_notes = NULL, report_path = NULL
        WHERE id = ?
      `).run(closedSessionId);
    }
    next(error);
  }
});

router.get('/:id/report', requireRole('admin', 'owner'), (req, res) => {
  const session = db.prepare('SELECT report_path FROM cash_sessions WHERE id = ? AND status = ?')
    .get(req.params.id, 'closed');
  if (!session?.report_path) return res.status(404).json({ error: 'Relatório não encontrado.' });
  const reportPath = path.resolve(reportsDirectory, session.report_path);
  if (!reportPath.startsWith(reportsDirectory) || !fs.existsSync(reportPath)) {
    return res.status(404).json({ error: 'Arquivo do relatório não encontrado.' });
  }
  res.download(reportPath, session.report_path);
});

module.exports = router;
