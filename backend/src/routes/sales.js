const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

const paymentMethods = new Set(['cash', 'pix', 'credit_card', 'debit_card', 'other']);
const cardBrands = new Set(['visa', 'mastercard', 'elo', 'amex', 'hipercard', 'diners', 'other']);

router.get('/', (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const sales = db.prepare(`
      SELECT s.*, u.name AS user_name
      FROM sales s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.id DESC
      LIMIT ?
    `).all(limit);
    res.json({ sales });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', (req, res) => {
  const sale = db.prepare(`
    SELECT s.*, u.name AS user_name
    FROM sales s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Venda não encontrada.' });
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(sale.id);
  res.json({ sale: { ...sale, items } });
});

router.post('/', (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const paymentMethod = String(req.body?.paymentMethod || '');
    const discountCents = Number(req.body?.discountCents ?? 0);
    const amountReceivedCents = req.body?.amountReceivedCents == null
      ? null
      : Number(req.body.amountReceivedCents);
    const sellerName = String(req.body?.sellerName || req.session.user.name || '').trim();
    const cardBrand = String(req.body?.cardBrand || '').trim().toLowerCase();

    if (!items.length) return res.status(400).json({ error: 'A venda precisa ter ao menos um item.' });
    if (sellerName.length > 100) {
      return res.status(400).json({ error: 'Informe um nome de vendedor válido.' });
    }
    if (!paymentMethods.has(paymentMethod)) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    if (['credit_card', 'debit_card'].includes(paymentMethod) && !cardBrands.has(cardBrand)) {
      return res.status(400).json({ error: 'Selecione uma bandeira de cartão válida.' });
    }
    if (!Number.isInteger(discountCents) || discountCents < 0) {
      return res.status(400).json({ error: 'Desconto inválido.' });
    }

    const createSale = db.transaction(() => {
      const cashSession = db.prepare(`
        SELECT id FROM cash_sessions WHERE status = 'open'
      `).get();
      if (!cashSession) {
        throw Object.assign(new Error('O caixa está fechado. Abra o caixa antes de vender.'), { status: 409 });
      }

      const quantitiesByProduct = new Map();
      for (const item of items) {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);
        if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
          throw Object.assign(new Error('Item de venda inválido.'), { status: 400 });
        }
        quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) || 0) + quantity);
      }

      const normalizedItems = [...quantitiesByProduct].map(([productId, quantity]) => {
        const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
        if (!product) throw Object.assign(new Error(`Produto ${productId} não encontrado.`), { status: 404 });
        if (product.stock_quantity < quantity) {
          throw Object.assign(new Error(`Estoque insuficiente para ${product.name}.`), { status: 409 });
        }
        return {
          product,
          quantity,
          totalCents: product.price_cents * quantity
        };
      });

      const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.totalCents, 0);
      if (discountCents > subtotalCents) {
        throw Object.assign(new Error('O desconto não pode superar o subtotal.'), { status: 400 });
      }
      const totalCents = subtotalCents - discountCents;
      if (paymentMethod === 'cash' && (!Number.isInteger(amountReceivedCents) || amountReceivedCents < totalCents)) {
        throw Object.assign(new Error('O valor recebido em dinheiro é insuficiente.'), { status: 400 });
      }
      const changeCents = paymentMethod === 'cash' ? amountReceivedCents - totalCents : 0;

      const saleResult = db.prepare(`
        INSERT INTO sales (
          user_id, subtotal_cents, discount_cents, total_cents,
          payment_method, amount_received_cents, change_cents, notes, cash_session_id, seller_name, card_brand
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.session.user.id,
        subtotalCents,
        discountCents,
        totalCents,
        paymentMethod,
        amountReceivedCents,
        changeCents,
        String(req.body.notes || '').trim() || null,
        cashSession.id,
        sellerName,
        ['credit_card', 'debit_card'].includes(paymentMethod) ? cardBrand : null
      );

      for (const item of normalizedItems) {
        db.prepare(`
          INSERT INTO sale_items (
            sale_id, product_id, product_name, quantity,
            unit_price_cents, unit_cost_cents, total_cents
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          saleResult.lastInsertRowid,
          item.product.id,
          item.product.name,
          item.quantity,
          item.product.price_cents,
          item.product.cost_cents,
          item.totalCents
        );
        db.prepare(`
          UPDATE products
          SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.quantity, item.product.id);
        db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity, reason, user_id)
          VALUES (?, 'sale', ?, ?, ?)
        `).run(item.product.id, -item.quantity, `Venda #${saleResult.lastInsertRowid}`, req.session.user.id);
      }

      return saleResult.lastInsertRowid;
    });

    const saleId = createSale();
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
    res.status(201).json({ sale: { ...sale, items: saleItems } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.post('/:id/cancel', requireRole('admin', 'owner'), (req, res, next) => {
  try {
    const cancel = db.transaction(() => {
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
      if (!sale) return { error: 'not_found' };
      if (sale.status === 'cancelled') return { error: 'already_cancelled' };

      const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);
      for (const item of items) {
        db.prepare(`
          UPDATE products
          SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.quantity, item.product_id);
        db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity, reason, user_id)
          VALUES (?, 'sale_reversal', ?, ?, ?)
        `).run(item.product_id, item.quantity, `Cancelamento da venda #${sale.id}`, req.session.user.id);
      }
      db.prepare(`
        UPDATE sales
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by = ?, cancel_reason = ?
        WHERE id = ?
      `).run(
        req.session.user.id,
        String(req.body?.reason || '').trim() || 'Cancelamento manual',
        sale.id
      );
      return { saleId: sale.id };
    });

    const result = cancel();
    if (result.error === 'not_found') return res.status(404).json({ error: 'Venda não encontrada.' });
    if (result.error === 'already_cancelled') return res.status(409).json({ error: 'Esta venda já foi cancelada.' });
    res.json({ sale: db.prepare('SELECT * FROM sales WHERE id = ?').get(result.saleId) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
