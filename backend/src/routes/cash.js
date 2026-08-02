const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { one, many, query, transaction } = require('../database');
const { config } = require('../config');
const { requireAuth, requireRole } = require('../middleware');
const { generateCashReport } = require('../cash-report');

const router = express.Router();
const reportsDirectory = path.resolve(config.dataDir, 'reports');
const backupsDirectory = path.resolve(config.dataDir, 'backups');
fs.mkdirSync(reportsDirectory, { recursive: true });
fs.mkdirSync(backupsDirectory, { recursive: true });
router.use(requireAuth);

function sessionDetails(id) {
  return one(`SELECT cs.*, opener.name AS opened_by_name, closer.name AS closed_by_name
    FROM cash_sessions cs JOIN users opener ON opener.id=cs.opened_by
    LEFT JOIN users closer ON closer.id=cs.closed_by WHERE cs.id=$1`, [id]);
}

function backupFileName(cashSessionId, date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `backup-do-dia-${parts.day}-${parts.month}-${parts.year}-as-${parts.hour}-${parts.minute}-${parts.second}-caixa-${cashSessionId}.json`;
}

router.get('/status', async (req, res, next) => { try {
  const session = await one(`SELECT cs.*,u.name AS opened_by_name,
    (SELECT MAX(cb.created_at) FROM cash_backups cb WHERE cb.cash_session_id=cs.id) AS last_backup_at,
    (cs.opened_at AT TIME ZONE 'America/Sao_Paulo')::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date AS is_stale
    FROM cash_sessions cs JOIN users u ON u.id=cs.opened_by WHERE cs.status='open'`);
  res.json({ isOpen: Boolean(session), session: session || null });
} catch (error) { next(error); } });

router.get('/history', requireRole('admin', 'owner'), async (req, res, next) => { try {
  const sessions = await many(`SELECT cs.*,opener.name AS opened_by_name,closer.name AS closed_by_name
    FROM cash_sessions cs JOIN users opener ON opener.id=cs.opened_by
    LEFT JOIN users closer ON closer.id=cs.closed_by ORDER BY cs.id DESC LIMIT 100`);
  res.json({ sessions });
} catch (error) { next(error); } });

router.post('/open', requireRole('admin', 'owner'), async (req, res, next) => { try {
  const amount = Number(req.body?.openingAmountCents ?? 0);
  if (!Number.isInteger(amount) || amount < 0) return res.status(400).json({ error: 'Valor inicial inválido.' });
  const row = await one('INSERT INTO cash_sessions(opened_by,opening_amount_cents) VALUES($1,$2) RETURNING id', [req.session.user.id, amount]);
  res.status(201).json({ session: await sessionDetails(row.id) });
} catch (error) {
  if (error.code === '23505') return res.status(409).json({ error: 'Já existe um caixa aberto.' });
  next(error);
} });

router.post('/backup', requireRole('admin', 'owner'), async (req, res, next) => { try {
  const cashSession = await one(`SELECT id FROM cash_sessions WHERE status='open'`);
  if (!cashSession) return res.status(409).json({ error: 'Não existe caixa aberto para fazer backup.' });
  const tableQueries = {
    users: `SELECT id,name,email,role,active,created_at,updated_at FROM users ORDER BY id`,
    products: `SELECT * FROM products ORDER BY id`,
    stock_movements: `SELECT * FROM stock_movements ORDER BY id`,
    cash_sessions: `SELECT * FROM cash_sessions ORDER BY id`,
    sales: `SELECT * FROM sales ORDER BY id`,
    sale_items: `SELECT * FROM sale_items ORDER BY id`
  };
  const data = {};
  const recordCounts = {};
  for (const [table, sql] of Object.entries(tableQueries)) {
    data[table] = await many(sql);
    recordCounts[table] = data[table].length;
  }
  const fileName = backupFileName(cashSession.id);
  const payload = {
    format: 'pdv-manaaim-backup', version: 1, created_at: new Date().toISOString(),
    cash_session_id: cashSession.id,
    created_by: { id: req.session.user.id, name: req.session.user.name, email: req.session.user.email },
    record_counts: recordCounts, data
  };
  fs.writeFileSync(path.join(backupsDirectory, fileName), JSON.stringify(payload, null, 2));
  const backup = await one(`INSERT INTO cash_backups(cash_session_id,created_by,file_name,record_counts)
    VALUES($1,$2,$3,$4::jsonb) RETURNING id,created_at`,
    [cashSession.id, req.session.user.id, fileName, JSON.stringify(recordCounts)]);
  res.status(201).json({ backup: { ...backup, file_name: fileName, record_counts: recordCounts }, backupUrl: `/api/cash/backups/${backup.id}/download` });
} catch (error) { next(error); } });

router.get('/backups/:id/download', requireRole('admin', 'owner'), async (req, res, next) => { try {
  const backup = await one('SELECT file_name FROM cash_backups WHERE id=$1', [req.params.id]);
  if (!backup) return res.status(404).json({ error: 'Backup não encontrado.' });
  const backupFile = path.resolve(backupsDirectory, backup.file_name);
  const relative = path.relative(backupsDirectory, backupFile);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(backupFile)) return res.status(404).json({ error: 'Arquivo de backup não encontrado.' });
  res.download(backupFile, backup.file_name);
} catch (error) { next(error); } });

router.post('/close', requireRole('admin', 'owner'), async (req, res, next) => {
  let closedSessionId;
  try {
    const backupState = await one(`SELECT cs.id,(SELECT MAX(cb.created_at) FROM cash_backups cb WHERE cb.cash_session_id=cs.id) AS last_backup_at
      FROM cash_sessions cs WHERE cs.status='open'`);
    if (!backupState) return res.status(409).json({ error: 'Não existe caixa aberto.' });
    if (!backupState.last_backup_at && req.body?.skipBackup !== true) {
      return res.status(428).json({ error: 'Faça o backup do caixa antes de fechar ou confirme que deseja continuar sem backup.', backupRequired: true });
    }
    closedSessionId = await transaction(async (client) => {
      const current = (await client.query(`SELECT * FROM cash_sessions WHERE status='open' FOR UPDATE`)).rows[0];
      if (!current) return null;
      const summary = (await client.query(`SELECT COUNT(*)::int sales_count,COALESCE(SUM(total_cents),0)::bigint revenue_cents,
        COALESCE(SUM(discount_cents),0)::bigint discounts_cents FROM sales WHERE cash_session_id=$1 AND status='completed'`, [current.id])).rows[0];
      const items = (await client.query(`SELECT COALESCE(SUM(si.quantity),0)::int items_sold,
        COALESCE(SUM((si.unit_price_cents-si.unit_cost_cents)*si.quantity),0)::bigint gross_profit_cents
        FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.cash_session_id=$1 AND s.status='completed'`, [current.id])).rows[0];
      await client.query(`UPDATE cash_sessions SET status='closed',closed_by=$1,closed_at=now(),closing_notes=$2,
        sales_count=$3,items_sold=$4,revenue_cents=$5,discounts_cents=$6,gross_profit_cents=$7 WHERE id=$8`,
        [req.session.user.id, String(req.body?.notes || '').trim() || null, summary.sales_count, items.items_sold,
          summary.revenue_cents, summary.discounts_cents, items.gross_profit_cents, current.id]);
      return current.id;
    });
    if (!closedSessionId) return res.status(409).json({ error: 'Não existe caixa aberto.' });
    const session = await sessionDetails(closedSessionId);
    const payments = await many(`SELECT payment_method,COUNT(*)::int sales_count,SUM(total_cents)::bigint total_cents
      FROM sales WHERE cash_session_id=$1 AND status='completed' GROUP BY payment_method ORDER BY total_cents DESC`, [closedSessionId]);
    const products = await many(`SELECT si.product_name,SUM(si.quantity)::int quantity,SUM(si.total_cents)::bigint revenue_cents
      FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.cash_session_id=$1 AND s.status='completed'
      GROUP BY si.product_id,si.product_name ORDER BY quantity DESC,revenue_cents DESC`, [closedSessionId]);
    const pdf = await generateCashReport({ session, payments, products });
    const reportName = `fechamento-caixa-${closedSessionId}.pdf`;
    fs.writeFileSync(path.join(reportsDirectory, reportName), pdf);
    await query('UPDATE cash_sessions SET report_path=$1 WHERE id=$2', [reportName, closedSessionId]);
    res.json({ session: await sessionDetails(closedSessionId), reportUrl: `/api/cash/${closedSessionId}/report` });
  } catch (error) {
    if (closedSessionId) await query(`UPDATE cash_sessions SET status='open',closed_by=NULL,closed_at=NULL,closing_notes=NULL,report_path=NULL WHERE id=$1`, [closedSessionId]).catch(() => {});
    next(error);
  }
});

router.delete('/:id/report', requireRole('admin', 'owner'), async (req, res, next) => { try {
  const session = await one(`SELECT report_path FROM cash_sessions WHERE id=$1 AND status='closed'`, [req.params.id]);
  if (!session?.report_path) return res.status(404).json({ error: 'Relatório não encontrado.' });
  const reportFile = path.resolve(reportsDirectory, session.report_path);
  const relative = path.relative(reportsDirectory, reportFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return res.status(400).json({ error: 'Caminho de relatório inválido.' });
  if (fs.existsSync(reportFile)) fs.unlinkSync(reportFile);
  await query('UPDATE cash_sessions SET report_path=NULL WHERE id=$1', [req.params.id]);
  res.status(204).end();
} catch (error) { next(error); } });

router.get('/:id/report', requireRole('admin', 'owner'), async (req, res, next) => { try {
  const session = await one(`SELECT report_path FROM cash_sessions WHERE id=$1 AND status='closed'`, [req.params.id]);
  if (!session?.report_path) return res.status(404).json({ error: 'Relatório não encontrado.' });
  const reportFile = path.resolve(reportsDirectory, session.report_path);
  const relative = path.relative(reportsDirectory, reportFile);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(reportFile)) return res.status(404).json({ error: 'Arquivo do relatório não encontrado.' });
  res.download(reportFile, session.report_path);
} catch (error) { next(error); } });

module.exports = router;
