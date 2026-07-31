const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabase = path.resolve(__dirname, `test-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = testDatabase;
process.env.SESSION_SECRET = 'segredo-exclusivo-dos-testes-com-mais-de-32-caracteres';
process.env.ADMIN_NAME = 'Admin Teste';
process.env.ADMIN_EMAIL = 'admin@teste.local';
process.env.ADMIN_PASSWORD = 'senha-teste-123';

const { seedAdministrator, db } = require('../src/database');
const { createApp } = require('../src/app');

seedAdministrator();
const server = createApp().listen(0, '127.0.0.1');
let baseUrl = '';
let cookie = '';
let uploadedImagePath = '';
let generatedReportPath = '';

async function request(pathname, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body && !isFormData ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers
    }
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test.before(async () => {
  if (!server.listening) {
    await new Promise((resolve) => server.once('listening', resolve));
  }
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('fluxo completo: login, produto, venda, estoque e relatório', async () => {
  const unauthenticated = await request('/api/products');
  assert.equal(unauthenticated.response.status, 401);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@teste.local', password: 'senha-teste-123' })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.role, 'admin');

  const cashOpening = await request('/api/cash/open', {
    method: 'POST',
    body: JSON.stringify({ openingAmountCents: 10000 })
  });
  assert.equal(cashOpening.response.status, 201);
  assert.equal(cashOpening.body.session.status, 'open');

  const created = await request('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      sku: 'LIV-001',
      name: 'Livro de Teste',
      category: 'Bíblias',
      costCents: 2000,
      priceCents: 3500,
      initialStock: 10,
      minimumStock: 2
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.product.stock_quantity, 10);

  const categorySearch = await request('/api/products?search=B%C3%ADblias');
  assert.equal(categorySearch.response.status, 200);
  assert.equal(categorySearch.body.products.length, 1);

  const imageData = new FormData();
  imageData.append('image', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'capa.png');
  const imageUpload = await request(`/api/products/${created.body.product.id}/image`, {
    method: 'POST',
    body: imageData
  });
  assert.equal(imageUpload.response.status, 200);
  assert.match(imageUpload.body.product.image_path, /^\/uploads\/products\/.+\.png$/);
  uploadedImagePath = path.resolve(__dirname, '..', imageUpload.body.product.image_path.replace(/^\//, ''));

  const sale = await request('/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: created.body.product.id, quantity: 2 }],
      paymentMethod: 'pix',
      discountCents: 500
    })
  });
  assert.equal(sale.response.status, 201);
  assert.equal(sale.body.sale.total_cents, 6500);

  const productAfterSale = await request(`/api/products/${created.body.product.id}`);
  assert.equal(productAfterSale.body.product.stock_quantity, 8);

  const stockSummary = await request('/api/stock/summary');
  assert.equal(stockSummary.response.status, 200);
  assert.equal(stockSummary.body.summary.total_units, 8);

  const movements = await request('/api/stock/movements');
  assert.equal(movements.response.status, 200);
  assert.equal(movements.body.movements.length, 2);

  const report = await request('/api/reports/summary?period=today');
  assert.equal(report.response.status, 200);
  assert.equal(report.body.summary.sales_count, 1);
  assert.equal(report.body.summary.items_sold, 2);
  assert.equal(report.body.summary.revenue_cents, 6500);

  const cancellation = await request(`/api/sales/${sale.body.sale.id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Venda lançada incorretamente' })
  });
  assert.equal(cancellation.response.status, 200);
  assert.equal(cancellation.body.sale.status, 'cancelled');
  assert.equal(cancellation.body.sale.cancel_reason, 'Venda lançada incorretamente');

  const productAfterCancellation = await request(`/api/products/${created.body.product.id}`);
  assert.equal(productAfterCancellation.body.product.stock_quantity, 10);

  const reportAfterCancellation = await request('/api/reports/summary?period=today');
  assert.equal(reportAfterCancellation.body.summary.sales_count, 0);
  assert.equal(reportAfterCancellation.body.summary.items_sold, 0);
  assert.equal(reportAfterCancellation.body.summary.revenue_cents, 0);

  const cashClosing = await request('/api/cash/close', {
    method: 'POST',
    body: JSON.stringify({ notes: 'Fechamento automatizado de teste' })
  });
  assert.equal(cashClosing.response.status, 200);
  assert.equal(cashClosing.body.session.status, 'closed');
  assert.match(cashClosing.body.reportUrl, /^\/api\/cash\/\d+\/report$/);
  generatedReportPath = path.resolve(
    __dirname, '..', 'reports', cashClosing.body.session.report_path
  );
  assert.equal(fs.existsSync(generatedReportPath), true);

  const closedSaleAttempt = await request('/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: created.body.product.id, quantity: 1 }],
      paymentMethod: 'pix'
    })
  });
  assert.equal(closedSaleAttempt.response.status, 409);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    const file = `${testDatabase}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  if (uploadedImagePath && fs.existsSync(uploadedImagePath)) fs.unlinkSync(uploadedImagePath);
  if (generatedReportPath && fs.existsSync(generatedReportPath)) fs.unlinkSync(generatedReportPath);
});
