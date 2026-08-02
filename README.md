# PDV Manaaim Livraria

PDV em Node.js e Express, com PostgreSQL hospedado no Supabase.

## Preparação

1. Instale o Node.js 20 ou superior e execute `npm install`.
2. No SQL Editor do Supabase, execute `supabase-schema.sql`.
3. No `.env`, informe `DATABASE_URL` com a connection string do pooler em modo Session.
4. Mantenha `DATABASE_SSL=true` e defina `SESSION_SECRET` e `ADMIN_PASSWORD` seguros.
5. Execute `npm run dev` e acesse `http://localhost:3000`.

As sessões também são persistidas no PostgreSQL. Vendas, alterações de estoque,
cancelamentos e fechamento de caixa usam transações para manter os dados consistentes.

## Rotas

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET|POST /api/products`, `GET|PATCH /api/products/:id`
- `POST /api/products/:id/stock`, `POST /api/products/:id/image`
- `GET|POST /api/sales`, `GET /api/sales/:id`, `POST /api/sales/:id/cancel`
- `GET /api/reports/summary`, `GET /api/stock/summary`, `GET /api/stock/movements`
- `GET /api/cash/status`, `GET /api/cash/history`, `POST /api/cash/open`
- `POST /api/cash/close`, `GET /api/cash/:id/report`
