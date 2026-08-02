const express = require('express');
const bcrypt = require('bcryptjs');
const { one, query } = require('../database');
const { requireAuth } = require('../middleware');
const router = express.Router();

router.post('/register', async (req,res,next) => { try {
  const name=String(req.body?.name||'').trim(), email=String(req.body?.email||'').trim().toLowerCase(), password=String(req.body?.password||'');
  if(name.length<3||name.length>100) return res.status(400).json({error:'Informe um nome válido.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Informe um e-mail válido.'});
  if(password.length<8) return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres.'});
  const user=await one(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'cashier') RETURNING id,name,email,role`,[name,email,bcrypt.hashSync(password,12)]);
  res.status(201).json({user});
} catch(e){next(e);} });

router.post('/reset-password', async (req,res,next) => { try {
  const email=String(req.body?.email||'').trim().toLowerCase(), password=String(req.body?.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Informe um e-mail válido.'});
  if(password.length<8) return res.status(400).json({error:'A nova senha deve ter pelo menos 8 caracteres.'});
  await query(`UPDATE users SET password_hash=$1,updated_at=now() WHERE lower(email)=lower($2) AND active=TRUE`,[bcrypt.hashSync(password,12),email]);
  res.json({message:'Se o e-mail estiver cadastrado, a senha foi atualizada.'});
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
