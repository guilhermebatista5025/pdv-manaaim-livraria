# PDV Manaaim Livraria

Backend local de um ponto de venda para uma livraria, construído com Node.js,
Express e SQLite.

O frontend responsivo **PDV-PRO LIVRARIA** é servido pelo mesmo endereço do
backend. Após iniciar o projeto, acesse `http://localhost:3000`.

## Preparação

1. Instale o Node.js 20 ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env`.
4. Troque `SESSION_SECRET` e `ADMIN_PASSWORD` no `.env`.
5. Execute `npm run dev`.

O banco será criado automaticamente em `backend/database/livraria.db`. Esse
arquivo pode ser aberto no DB Browser for SQLite quando o servidor estiver
parado. Não edite o banco manualmente durante uma venda.

## Rotas disponíveis

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET|POST /api/products`
- `GET|PATCH /api/products/:id`
- `POST /api/products/:id/stock`
- `POST /api/products/:id/image` (`multipart/form-data`, campo `image`)
- `GET|POST /api/sales`
- `GET /api/sales/:id`
- `POST /api/sales/:id/cancel`
- `GET /api/reports/summary?period=today|week|month`
- `GET /api/stock/summary`
- `GET /api/stock/movements`
- `GET /api/cash/status`
- `GET /api/cash/history`
- `POST /api/cash/open`
- `POST /api/cash/close`
- `GET /api/cash/:id/report`

As rotas protegidas usam uma sessão armazenada no SQLite e um cookie `HttpOnly`.
Preços e custos são enviados e armazenados como números inteiros em centavos.

As vendas só podem ser registradas durante uma sessão de caixa aberta. O
fechamento consolida o período, gera um relatório PDF e mantém o histórico
financeiro disponível para auditoria.
