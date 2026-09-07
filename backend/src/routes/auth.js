const express = require('express');
const bcrypt = require('bcryptjs');
const { one, query } = require('../database');
const { requireAuth, requireRole } = require('../middleware');
const router = express.Router();

function accountInput(body = {}) {
  const name = String(body.name || '').trim().replace(/\0/g, '');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (name.length < 3 || name.length > 100) {
    throw Object.assign(new Error('Informe um nome válido.'), { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Informe um e-mail válido.'), { status: 400 });
  }
  if (password.length < 8) {
    throw Object.assign(new Error('A senha deve ter pelo menos 8 caracteres.'), { status: 400 });
  }
  return { name, email, password };
}

router.post('/users', requireRole('admin', 'owner'), async (req,res,next) => { try {
  const input = accountInput(req.body);
  const requestedRole = String(req.body?.role || 'cashier');
  const role = req.session.user.role === 'owner' && ['admin', 'owner', 'cashier'].includes(requestedRole)
    ? requestedRole
    : 'cashier';
  const user=await one(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role`,[input.name,input.email,bcrypt.hashSync(input.password,12),role]);
  res.status(201).json({user});
} catch(e){next(e);} });

router.post('/reset-password', requireRole('admin', 'owner'), async (req,res,next) => { try {
  const email=String(req.body?.email||'').trim().toLowerCase(), password=String(req.body?.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Informe um e-mail válido.'});
  if(password.length<8) return res.status(400).json({error:'A nova senha deve ter pelo menos 8 caracteres.'});
  const result = await query(`UPDATE users SET password_hash=$1,updated_at=now() WHERE lower(email)=lower($2) AND active=TRUE`,[bcrypt.hashSync(password,12),email]);
  if (!result.rowCount) return res.status(404).json({error:'Usuário ativo não encontrado.'});
  res.json({message:'Senha atualizada.'});
} catch(e){next(e);} });

router.post('/change-password', requireAuth, async (req,res,next) => { try {
  const currentPassword = String(req.body?.currentPassword || '');
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
  const user = await one('SELECT password_hash FROM users WHERE id=$1 AND active=TRUE', [req.session.user.id]);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Senha atual inválida.' });
  await query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [bcrypt.hashSync(password, 12), req.session.user.id]);
  res.json({ message: 'Senha atualizada.' });
} catch(e){next(e);} });

router.post('/login', async (req,res,next) => { try {
  const email=String(req.body?.email||'').trim().toLowerCase(), password=String(req.body?.password||'');
  if(!email||!password) return res.status(400).json({error:'Informe e-mail e senha.'});
  const user=await one(`SELECT id,name,email,password_hash,role FROM users WHERE lower(email)=lower($1) AND active=TRUE`,[email]);
  if(!user||!bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:'E-mail ou senha inválidos.'});
  req.session.regenerate((e)=>{if(e)return next(e); req.session.user={id:user.id,name:user.name,email:user.email,role:user.role}; res.json({user:req.session.user});});
} catch(e){next(e);} });
router.post('/logout',requireAuth,(req,res,next)=>req.session.destroy(e=>{if(e)return next(e);res.clearCookie('pdv.sid');res.status(204).end();}));
router.get('/me',(req,res)=>res.json({user:req.session?.user||null}));
module.exports=router;
