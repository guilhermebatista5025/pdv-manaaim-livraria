# PDV Manaaim Livraria

PDV em Node.js e Express, com PostgreSQL hospedado no Supabase.

## Preparação

1. Instale o Node.js 20 ou superior e execute `npm install`.
2. No SQL Editor do Supabase, execute `supabase-schema.sql` (caso o banco ainda não tenha sido preparado).
3. No `.env`, informe `DATABASE_URL` com a connection string do pooler em modo Session.
4. Mantenha `DATABASE_SSL=true` e defina `SESSION_SECRET` e `ADMIN_PASSWORD` seguros.
5. Execute `npm run dev` e acesse `http://localhost:3000`.

## Publicação na Vercel

O arquivo `vercel.json` direciona `/api/*` para a função Express em `api/index.js`.
Antes do deploy, configure no projeto da Vercel as variáveis `DATABASE_URL`,
`DATABASE_SSL=true`, `SESSION_SECRET`, `NODE_ENV=production`, `ADMIN_NAME`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
`SUPABASE_PRODUCT_IMAGES_BUCKET=product-images`. O `.env` local não é enviado ao GitHub.

As imagens dos produtos são persistidas no Supabase Storage. PDFs e backups gerados
durante a execução ainda usam o diretório temporário da função na Vercel.

As sessões também são persistidas no PostgreSQL. Vendas, alterações de estoque,
cancelamentos e fechamento de caixa usam transações para manter os dados consistentes.

## Contas e senhas

O primeiro administrador é criado pelas variáveis `ADMIN_NAME`, `ADMIN_EMAIL` e
`ADMIN_PASSWORD` quando ainda não há usuários. Não há cadastro ou redefinição pública:
isso impediria que qualquer pessoa criasse uma conta administrativa ou alterasse a senha
de outra pessoa. Após entrar, um administrador ou proprietário pode criar operadores em
`POST /api/auth/users` e redefinir a senha de uma conta em `POST /api/auth/reset-password`.
Para trocar a própria senha, use `POST /api/auth/change-password` com a senha atual.

## Leitor de código de barras

No caixa, use o campo **"Bipe ou digite o código"** para testar sem o leitor: informe um
código salvo no campo `Código de barras` do produto e pressione Enter. O item é incluído
diretamente no carrinho; uma nova leitura acrescenta outra unidade.

Leitores USB ou Bluetooth normalmente funcionam como teclado. Configure o seu para enviar
**Enter** ao final da leitura e deixe esse campo em foco. O sistema procura primeiro o código
de barras exato e, como alternativa, aceita o SKU. Produtos inativos ou sem cadastro não são
adicionados.

## Rotas

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/users` (administrador/proprietário), `POST /api/auth/reset-password` (administrador/proprietário), `POST /api/auth/change-password`
- `GET|POST /api/products`, `GET /api/products/lookup?code=...`, `GET|PATCH /api/products/:id`
- `POST /api/products/:id/stock`, `POST /api/products/:id/image`
- `GET|POST /api/sales`, `GET /api/sales/:id`, `POST /api/sales/:id/cancel`
- `GET /api/reports/summary`, `GET /api/stock/summary`, `GET /api/stock/movements`
- `GET /api/cash/status`, `GET /api/cash/history`, `POST /api/cash/open`
- `POST /api/cash/close`, `GET /api/cash/:id/report`
