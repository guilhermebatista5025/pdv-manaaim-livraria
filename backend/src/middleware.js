function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Autenticação necessária.' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Você não possui permissão para esta ação.' });
    }
    next();
  };
}

function notFound(req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'A imagem deve ter no máximo 5 MB.' });
  }
  if (error.message === 'Formato de imagem inválido.') {
    return res.status(400).json({ error: error.message });
  }
  if (error.code === '23505') {
    return res.status(409).json({ error: 'Já existe um registro com esses dados.' });
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
}

module.exports = { requireAuth, requireRole, notFound, errorHandler };
