const { config } = require('./config');

function storageConfig() {
  const { url, serviceRoleKey, productImagesBucket } = config.supabase;
  if (!url || !serviceRoleKey) {
    throw Object.assign(new Error('O armazenamento de imagens ainda não foi configurado.'), { status: 503 });
  }
  return { url, serviceRoleKey, bucket: productImagesBucket };
}

function headers(serviceRoleKey, extra = {}) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, ...extra };
}

async function ensureProductImagesBucket() {
  const { url, serviceRoleKey, bucket } = storageConfig();
  const existing = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers: headers(serviceRoleKey) });
  if (existing.ok) return;
  if (existing.status !== 404) {
    const data = await existing.json().catch(() => null);
    throw new Error(data?.message || data?.error || 'Não foi possível consultar o bucket de imagens.');
  }
  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(serviceRoleKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] })
  });
  if (!response.ok && response.status !== 409) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || data?.error || 'Não foi possível preparar o bucket de imagens.');
  }
}

async function uploadProductImage(fileName, file) {
  const { url, serviceRoleKey, bucket } = storageConfig();
  await ensureProductImagesBucket();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${fileName}`, {
    method: 'POST',
    headers: headers(serviceRoleKey, { 'Content-Type': file.mimetype, 'x-upsert': 'false' }),
    body: file.buffer
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || data?.error || 'Não foi possível enviar a imagem do produto.');
  }
  return `${url}/storage/v1/object/public/${bucket}/${fileName}`;
}

module.exports = { uploadProductImage };
