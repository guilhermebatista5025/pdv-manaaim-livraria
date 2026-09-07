const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://unused:unused@localhost:5432/unused';
process.env.SESSION_SECRET ||= 'test-session-secret-with-at-least-thirty-two-characters';

const { createApp } = require('../src/app');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function post(path, body = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('rotas de administração de contas não são públicas', async () => {
  for (const path of ['/api/auth/users', '/api/auth/reset-password', '/api/auth/change-password']) {
    const response = await post(path, { name: 'Usuário de teste', email: 'teste@example.com', password: 'senha-segura' });
    assert.equal(response.status, 401, path);
  }

  const legacyRegistration = await post('/api/auth/register', {
    name: 'Usuário de teste', email: 'teste@example.com', password: 'senha-segura'
  });
  assert.equal(legacyRegistration.status, 404);
});
