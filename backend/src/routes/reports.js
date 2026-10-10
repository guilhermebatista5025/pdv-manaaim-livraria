const express = require('express');
const { one, many } = require('../database');
const { requireRole } = require('../middleware');

const router = express.Router();
router.use(requireRole('admin', 'owner'));

router.get('/summary', async (req, res, next) => {
  try {
    const period = String(req.query.period || 'today');
    const year = Number(req.query.year || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      return res.status(400).json({ error: 'Ano inválido.' });
    }

    const periods = {
      today: {
        start: `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,
        previousStart: `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' - interval '1 day'`,
        previousEnd: `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,
        bucket: 'hour', label: 'hour', interval: '1 hour', labelFormat: 'HH24h'
      },
      week: {
        start: `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' - interval '6 days'`,
        previousStart: `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' - interval '13 days'`,
        previousEnd: `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' - interval '6 days'`,
        bucket: 'day', label: 'day', interval: '1 day', labelFormat: 'DD/MM'
      },
      month: {
        start: `date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,
        previousStart: `date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' - interval '1 month'`,
        previousEnd: `date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,
        end: `LEAST(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month', date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day')`,
        bucket: 'day', label: 'day', interval: '1 day', labelFormat: 'DD/MM'
      },
      year: {
        start: `make_date($2::int, 1, 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`,
        end: `LEAST(make_date($2::int + 1, 1, 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month')`,
        previousStart: `make_date($2::int - 1, 1, 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`,
        previousEnd: `CASE WHEN $2::int = extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::int THEN (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month' - interval '1 year') AT TIME ZONE 'America/Sao_Paulo' ELSE make_date($2::int, 1, 1)::timestamp AT TIME ZONE 'America/Sao_Paulo' END`,
        bucket: 'month', label: 'month', interval: '1 month', labelFormat: 'Mon'
      }
    };
    const config = periods[period];
    if (!config) return res.status(400).json({ error: 'Período inválido.' });

    const current = req.query.scope === 'current' ? await one(`SELECT id FROM cash_sessions WHERE status='open'`) : null;
    const sessionId = req.query.scope === 'current' ? (current?.id || -1) : null;
    const params = period === 'year' ? [sessionId, year] : [sessionId];
    const end = config.end || 'now()';
    const filter = `status='completed' AND created_at>=${config.start} AND created_at<${end} AND ($1::bigint IS NULL OR cash_session_id=$1)`;
    const previousFilter = `status='completed' AND created_at>=${config.previousStart} AND created_at<${config.previousEnd} AND ($1::bigint IS NULL OR cash_session_id=$1)`;

    const [sales, products, previous, trendRows, paymentMix, lowStock, topProducts] = await Promise.all([
      one(`SELECT COUNT(*)::int AS sales_count, COALESCE(SUM(total_cents),0)::bigint AS revenue_cents, COALESCE(SUM(discount_cents),0)::bigint AS discounts_cents FROM sales WHERE ${filter}`, params),
      one(`SELECT COALESCE(SUM(si.quantity),0)::int AS items_sold, COALESCE(SUM((si.unit_price_cents-si.unit_cost_cents)*si.quantity),0)::bigint AS gross_profit_cents FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.${filter}`, params),
      one(`SELECT COUNT(*)::int AS sales_count, COALESCE(SUM(total_cents),0)::bigint AS revenue_cents FROM sales WHERE ${previousFilter}`, params),
      many(`SELECT date_trunc('${config.bucket}', created_at AT TIME ZONE 'America/Sao_Paulo') AS bucket, extract(${config.label === 'hour' ? 'hour' : config.label === 'month' ? 'month' : 'day'} FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS slot, to_char(date_trunc('${config.label}', created_at AT TIME ZONE 'America/Sao_Paulo'), '${config.labelFormat}') AS label, COUNT(*)::int AS sales_count, COALESCE(SUM(total_cents),0)::bigint AS revenue_cents FROM sales WHERE ${filter} GROUP BY 1,2,3 ORDER BY 1`, params),
      many(`SELECT payment_method, COUNT(*)::int AS sales_count, COALESCE(SUM(total_cents),0)::bigint AS revenue_cents FROM sales WHERE ${filter} GROUP BY payment_method ORDER BY revenue_cents DESC`, params),
      many(`SELECT id,name,sku,stock_quantity,minimum_stock FROM products WHERE active=TRUE AND stock_quantity<=minimum_stock ORDER BY stock_quantity,name LIMIT 20`),
      many(`SELECT si.product_id,si.product_name,SUM(si.quantity)::int AS quantity,SUM(si.total_cents)::bigint AS revenue_cents FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.${filter} GROUP BY si.product_id,si.product_name ORDER BY quantity DESC,revenue_cents DESC LIMIT 10`, params)
    ]);

    const nowSaoPaulo = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const slots = period === 'today' ? 24 : period === 'year' ? (year === nowSaoPaulo.getFullYear() ? nowSaoPaulo.getMonth() + 1 : 12) : period === 'month'
      ? Math.min(nowSaoPaulo.getDate(), new Date(Date.UTC(nowSaoPaulo.getFullYear(), nowSaoPaulo.getMonth() + 1, 0)).getUTCDate())
      : 7;
    const periodStart = period === 'year' ? new Date(Date.UTC(year, 0, 1))
      : period === 'month' ? new Date(Date.UTC(nowSaoPaulo.getFullYear(), nowSaoPaulo.getMonth(), 1))
        : period === 'week' ? new Date(Date.UTC(nowSaoPaulo.getFullYear(), nowSaoPaulo.getMonth(), nowSaoPaulo.getDate() - 6)) : null;
    let filledTrend = Array.from({ length: slots }, (_, index) => {
      const hour = period === 'today';
      const day = periodStart ? new Date(periodStart.getTime() + index * 86400000) : null;
      const expectedLabel = hour ? `${String(index).padStart(2, '0')}h` : period === 'year'
        ? new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, index, 1)))
        : `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}`;
      const slot = hour ? index : period === 'year' ? index + 1 : day.getUTCDate();
      const row = trendRows.find((item) => Number(item.slot) === slot);
      return { label: period === 'year' ? new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, index, 1))) : expectedLabel, sales_count: row?.sales_count || 0, revenue_cents: row?.revenue_cents || 0 };
    });
    if (period === 'year') {
      const firstMonthWithSales = filledTrend.findIndex((point) => Number(point.sales_count) > 0);
      filledTrend = firstMonthWithSales < 0 ? [] : filledTrend.slice(firstMonthWithSales);
    }

    res.json({ period, year, summary: { ...sales, ...products }, previous, trend: filledTrend, paymentMix, lowStock, topProducts });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
