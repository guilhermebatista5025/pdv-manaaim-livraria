const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { db } = require('../database');
const { requireAuth, requireRole } = require('../middleware');

const router = express.Router();
const uploadDirectory = path.resolve(__dirname, '..', '..', 'uploads', 'products');
fs.mkdirSync(uploadDirectory, { recursive: true });

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      const extension = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp'
      }[file.mimetype];
      callback(null, `${crypto.randomUUID()}${extension || ''}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    callback(allowed.has(file.mimetype) ? null : new Error('Formato de imagem inválido.'), allowed.has(file.mimetype));
  }
});

router.use(requireAuth);

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw Object.assign(new Error(`${field} inválido.`), { status: 400 });
  }
  return number;
}

router.get('/', (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const includeInactive = req.query.includeInactive === 'true';
    const like = `%${search}%`;
    const products = db.prepare(`
      SELECT *
      FROM products
      WHERE (? = 1 OR active = 1)
        AND (? = '' OR name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR category LIKE ?)
      ORDER BY name
    `).all(includeInactive ? 1 : 0, search, like, like, like, like);
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json({ product });
});

router.post('/', requireRole('admin', 'owner'), (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'O nome do produto é obrigatório.' });

    const priceCents = nonNegativeInteger(req.body.priceCents, 'Preço');
    const costCents = nonNegativeInteger(req.body.costCents ?? 0, 'Custo');
    const initialStock = nonNegativeInteger(req.body.initialStock ?? 0, 'Estoque inicial');
    const minimumStock = nonNegativeInteger(req.body.minimumStock ?? 0, 'Estoque mínimo');

    const create = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO products (
          sku, barcode, name, description, category, cost_cents,
          price_cents, stock_quantity, minimum_stock
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        optionalText(req.body.sku),
        optionalText(req.body.barcode),
        name,
        optionalText(req.body.description),
        optionalText(req.body.category),
        costCents,
        priceCents,
        initialStock,
        minimumStock
      );

      if (initialStock > 0) {
        db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity, reason, user_id)
          VALUES (?, 'initial', ?, 'Estoque inicial', ?)
        `).run(result.lastInsertRowid, initialStock, req.session.user.id);
      }
      return result.lastInsertRowid;
    });

    const id = create();
    res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.patch('/:id', requireRole('admin', 'owner'), (req, res, next) => {
  try {
    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Produto não encontrado.' });

    const name = req.body.name === undefined ? current.name : String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'O nome do produto é obrigatório.' });

    db.prepare(`
      UPDATE products SET
        sku = ?, barcode = ?, name = ?, description = ?, category = ?,
        cost_cents = ?, price_cents = ?, minimum_stock = ?, active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      req.body.sku === undefined ? current.sku : optionalText(req.body.sku),
      req.body.barcode === undefined ? current.barcode : optionalText(req.body.barcode),
      name,
      req.body.description === undefined ? current.description : optionalText(req.body.description),
      req.body.category === undefined ? current.category : optionalText(req.body.category),
      req.body.costCents === undefined ? current.cost_cents : nonNegativeInteger(req.body.costCents, 'Custo'),
      req.body.priceCents === undefined ? current.price_cents : nonNegativeInteger(req.body.priceCents, 'Preço'),
      req.body.minimumStock === undefined ? current.minimum_stock : nonNegativeInteger(req.body.minimumStock, 'Estoque mínimo'),
      req.body.active === undefined ? current.active : req.body.active ? 1 : 0,
      current.id
    );

    res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(current.id) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.post('/:id/stock', requireRole('admin', 'owner'), (req, res, next) => {
  try {
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason || '').trim();
    if (!Number.isInteger(quantity) || quantity === 0) {
      return res.status(400).json({ error: 'Informe uma quantidade inteira diferente de zero.' });
    }
    if (!reason) return res.status(400).json({ error: 'Informe o motivo do ajuste.' });

    const adjust = db.transaction(() => {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return { error: 'not_found' };
      if (product.stock_quantity + quantity < 0) return { error: 'negative_stock' };

      db.prepare(`
        UPDATE products
        SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(quantity, product.id);
      db.prepare(`
        INSERT INTO stock_movements (product_id, type, quantity, reason, user_id)
        VALUES (?, 'adjustment', ?, ?, ?)
      `).run(product.id, quantity, reason, req.session.user.id);
      return { productId: product.id };
    });

    const result = adjust();
    if (result.error === 'not_found') return res.status(404).json({ error: 'Produto não encontrado.' });
    if (result.error === 'negative_stock') return res.status(409).json({ error: 'O ajuste deixaria o estoque negativo.' });
    res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(result.productId) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/image', requireRole('admin', 'owner'), imageUpload.single('image'), (req, res, next) => {
  try {
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
    if (!req.file) return res.status(400).json({ error: 'Selecione uma imagem JPG, PNG ou WebP.' });

    const imagePath = `/uploads/products/${req.file.filename}`;
    db.prepare(`
      UPDATE products SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(imagePath, product.id);
    res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(product.id) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
