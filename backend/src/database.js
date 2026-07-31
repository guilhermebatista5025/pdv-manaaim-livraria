const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { config } = require('./config');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier'
      CHECK (role IN ('admin', 'owner', 'cashier')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE COLLATE NOCASE,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    type TEXT NOT NULL CHECK (type IN ('initial', 'purchase', 'adjustment', 'sale', 'sale_reversal')),
    quantity INTEGER NOT NULL,
    reason TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_method TEXT NOT NULL
      CHECK (payment_method IN ('cash', 'pix', 'credit_card', 'debit_card', 'other')),
    amount_received_cents INTEGER,
    change_cents INTEGER NOT NULL DEFAULT 0 CHECK (change_cents >= 0),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'completed'
      CHECK (status IN ('completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TEXT,
    cancelled_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0)
  );

  CREATE TABLE IF NOT EXISTS cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_by INTEGER NOT NULL REFERENCES users(id),
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    opening_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (opening_amount_cents >= 0),
    closed_by INTEGER REFERENCES users(id),
    closed_at TEXT,
    closing_notes TEXT,
    sales_count INTEGER NOT NULL DEFAULT 0,
    items_sold INTEGER NOT NULL DEFAULT 0,
    revenue_cents INTEGER NOT NULL DEFAULT 0,
    discounts_cents INTEGER NOT NULL DEFAULT 0,
    gross_profit_cents INTEGER NOT NULL DEFAULT 0,
    report_path TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_single_open_cash_session
    ON cash_sessions(status) WHERE status = 'open';
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
`);

const productColumns = db.prepare('PRAGMA table_info(products)').all();
if (!productColumns.some((column) => column.name === 'image_path')) {
  db.exec('ALTER TABLE products ADD COLUMN image_path TEXT');
}

const saleColumns = db.prepare('PRAGMA table_info(sales)').all();
if (!saleColumns.some((column) => column.name === 'cancel_reason')) {
  db.exec('ALTER TABLE sales ADD COLUMN cancel_reason TEXT');
}
if (!saleColumns.some((column) => column.name === 'cash_session_id')) {
  db.exec('ALTER TABLE sales ADD COLUMN cash_session_id INTEGER');
}
if (!saleColumns.some((column) => column.name === 'seller_name')) {
  db.exec('ALTER TABLE sales ADD COLUMN seller_name TEXT');
}
if (!saleColumns.some((column) => column.name === 'card_brand')) {
  db.exec('ALTER TABLE sales ADD COLUMN card_brand TEXT');
}

function seedAdministrator() {
  const hasUsers = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (hasUsers || !config.admin.email || !config.admin.password) return;

  if (config.admin.password.length < 8 || config.admin.password === 'troque-esta-senha') {
    console.warn('Administrador inicial não criado: defina ADMIN_PASSWORD com pelo menos 8 caracteres.');
    return;
  }

  const passwordHash = bcrypt.hashSync(config.admin.password, 12);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, 'admin')
  `).run(config.admin.name, config.admin.email, passwordHash);

  console.log(`Administrador inicial criado: ${config.admin.email}`);
}

module.exports = { db, seedAdministrator };
