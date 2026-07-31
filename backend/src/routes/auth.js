const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAuth } = require('../middleware');

const router = express.Router();

router.post('/register', (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (name.length < 3 || name.length > 100) {
      return res.status(400).json({ error: 'Informe um nome válido.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    }

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'cashier')
    `).run(name, email, bcrypt.hashSync(password, 12));

    res.status(201).json({
      user: { id: result.lastInsertRowid, name, email, role: 'cashier' }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
    }

    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE email = ? AND active = 1
    `).run(bcrypt.hashSync(password, 12), email);

    res.json({ message: 'Se o e-mail estiver cadastrado, a senha foi atualizada.' });
  } catch (error) {
    next(error);
  }
});

router.post('/login', (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }

    const user = db.prepare(`
      SELECT id, name, email, password_hash, role
      FROM users
      WHERE email = ? AND active = 1
    `).get(email);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      };
      res.json({ user: req.session.user });
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('pdv.sid');
    res.status(204).end();
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

module.exports = router;
