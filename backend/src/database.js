const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');
const { config } = require('./config');

types.setTypeParser(20, (value) => Number(value));
const pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : false });
const query = (text, params = [], client = pool) => client.query(text, params);
const one = async (text, params = [], client = pool) => (await query(text, params, client)).rows[0];
const many = async (text, params = [], client = pool) => (await query(text, params, client)).rows;

async function transaction(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function seedAdministrator() {
  if (await one('SELECT 1 FROM users LIMIT 1') || !config.admin.email || !config.admin.password) return;
  if (config.admin.password.length < 8 || config.admin.password === 'troque-esta-senha') {
    console.warn('Administrador inicial não criado: defina ADMIN_PASSWORD com pelo menos 8 caracteres.'); return;
  }
  await query(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin')`,
    [config.admin.name, config.admin.email, bcrypt.hashSync(config.admin.password, 12)]);
  console.log(`Administrador inicial criado: ${config.admin.email}`);
}

module.exports = { pool, query, one, many, transaction, seedAdministrator };
