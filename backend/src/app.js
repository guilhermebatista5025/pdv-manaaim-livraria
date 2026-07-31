const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('node:path');
const BetterSqlite3SessionStore = require('better-sqlite3-session-store')(session);
const { db } = require('./database');
const { config } = require('./config');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const reportRoutes = require('./routes/reports');
const stockRoutes = require('./routes/stock');
const cashRoutes = require('./routes/cash');
const { notFound, errorHandler } = require('./middleware');

function createApp() {
  const app = express();
  const sessionStore = config.env === 'test'
    ? new session.MemoryStore()
    : new BetterSqlite3SessionStore({
        client: db,
        expired: { clear: true, intervalMs: 15 * 60 * 1000 }
      });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    name: 'pdv.sid',
    store: sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.env === 'production',
      maxAge: config.sessionMaxAgeHours * 60 * 60 * 1000
    }
  }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'connected' });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/stock', stockRoutes);
  app.use('/api/cash', cashRoutes);

  const frontendPath = path.resolve(__dirname, '..', '..', 'frontend');
  const rootPath = path.resolve(__dirname, '..', '..');
  app.use('/vendor/fontawesome', express.static(
    path.resolve(rootPath, 'node_modules', '@fortawesome', 'fontawesome-free')
  ));
  app.use('/uploads', express.static(path.resolve(rootPath, 'backend', 'uploads')));
  app.use(express.static(frontendPath));
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(rootPath, 'index.html'));
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
