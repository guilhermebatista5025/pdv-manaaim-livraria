# Plano: entrada de produtos por código de barras, custo médio e markup

**Status:** implementação feita e migração aditiva aplicada ao Supabase configurado; validação do leitor físico ainda pendente.
**Objetivo:** registrar compras escaneando o código do produto, atualizar estoque e custo médio com histórico auditável e calcular um preço de venda sugerido pelo markup.

## Como o sistema funciona hoje

- `products` já guarda SKU, código de barras, estoque, custo (`cost_cents`) e preço de venda (`price_cents`).
- A busca exata por código de barras ou SKU retorna o cadastro do produto, incluindo categoria, preço e estoque.
- A tela **Estoque → Movimentar estoque** hoje altera apenas quantidade e motivo; não registra o custo de compra nem recalcula o custo médio.
- As vendas guardam uma cópia do custo do produto em `sale_items.unit_cost_cents`. Isso permite calcular o resultado da venda, desde que `products.cost_cents` seja mantido como custo médio atualizado.

## Markup no cadastro de produtos

O cadastro também salva `markup_percent` por produto. Ao informar custo e markup, a tela calcula o preço sugerido em tempo real; **Usar preço sugerido** copia o valor para o campo de venda, sem alterar o preço automaticamente. O markup é enviado nas criações e edições e passa a preencher o campo de markup na próxima entrada de mercadoria. O padrão dos produtos existentes e de novos produtos é 0% até a pessoa definir outro percentual.

## Fluxo proposto

1. A pessoa abre **Estoque → Entrada de mercadoria** e escaneia/digita o código da embalagem.
2. O PDV procura o código de barras (com fallback para SKU) e mostra o produto encontrado, categoria, estoque atual, custo médio atual e preço de venda. O código precisa pertencer a um produto já cadastrado; código desconhecido não cria produto automaticamente.
3. A pessoa informa quantidade recebida, custo unitário da compra e markup desejado. Fornecedor e número da nota podem ser campos opcionais para melhorar a rastreabilidade.
4. Antes de confirmar, o sistema mostra o novo custo médio e o preço de venda sugerido. A pessoa confere os valores.
5. Ao confirmar, numa única transação: grava a movimentação de entrada, soma a quantidade, atualiza o custo médio e — somente se autorizado na tela — atualiza o preço de venda.
6. A movimentação fica no histórico com usuário, data, quantidade, custo unitário, custo médio anterior e novo. Correções posteriores devem gerar estorno/ajuste rastreável; não apagar uma compra já confirmada.

## Prévia da tela

```text
Entrada de mercadoria

Código de barras / SKU  [ Escaneie ou digite o código...           ]
Produto encontrado      Livro de exemplo
Categoria               Livros                 Estoque atual       2 un.
Custo médio atual       R$ 10,00               Preço de venda      R$ 15,00

Quantidade recebida     [ 3       ] un.
Custo unitário da compra[ R$ 12,00             ]
Markup                  [ 50,00   ] %

Novo custo médio        R$ 11,20
Preço sugerido          R$ 16,80
[ ] Atualizar o preço de venda para o preço sugerido

Fornecedor (opcional)   [                                    ]
Nota fiscal (opcional)  [                                    ]

[Cancelar]                                  [Confirmar entrada]
```

O preço atual deve permanecer inalterado por padrão. A caixa de atualização explícita evita que uma entrada de compra altere preços de venda sem conferência.

## Regras de cálculo

### Custo médio ponderado móvel

`novo custo médio = ((estoque atual × custo médio atual) + (quantidade recebida × custo unitário da compra)) ÷ (estoque atual + quantidade recebida)`

Calcular internamente em centavos inteiros e arredondar o custo médio final para o centavo mais próximo. Se o estoque anterior for zero, o novo custo médio é o custo unitário da compra.

**Exemplo:** 2 unidades a custo médio de R$ 10,00 + entrada de 3 unidades a R$ 12,00 = custo total de R$ 56,00 para 5 unidades; novo custo médio = **R$ 11,20**.

### Markup e preço sugerido

`preço sugerido = novo custo médio × (1 + markup percentual ÷ 100)`

No exemplo, com markup de 50%: R$ 11,20 × 1,50 = **R$ 16,80**. Markup de 50% sobre o custo não equivale a margem bruta de 50% sobre o preço; nesse exemplo a margem sobre a venda é 33,33%. A interface deve deixar isso claro para não confundir markup com margem.

## Mudanças técnicas planejadas

1. **Schema/migration:** preservar os campos atuais de produto e acrescentar ao histórico de movimentações os dados necessários para auditar compras, como custo unitário e total da entrada, custo médio anterior/novo e, se o preço for atualizado, preço anterior/novo e markup usado. Quantidade e custos precisam de validação positiva. Não apagar o histórico existente.
2. **Backend:** criar uma rota autenticada de entrada de mercadoria que receba código, quantidade, custo unitário, markup e opção de atualizar o preço. Resolver o produto por barcode/SKU e fazer lookup, bloqueio da linha (`FOR UPDATE`), cálculo e gravações na mesma transação para evitar perda de estoque/custo em entradas simultâneas.
3. **Frontend:** adicionar a tela de entrada com busca por leitor, resumo do produto, campos da compra, cálculo de prévia e confirmação. Manter a movimentação manual atual para ajustes e correções, sem misturá-la com compra precificada.
4. **CMV nas vendas:** continuar registrando em cada item vendido uma cópia do custo médio vigente no momento da venda. O relatório de lucro usa esse custo histórico, então uma compra futura não deve reescrever o custo de vendas passadas.
5. **Validação e testes:** testar busca por barcode e SKU, código desconhecido, quantidade/custo inválidos, estoque zero, cálculo ponderado, arredondamento, atualização opcional do preço, simultaneidade de entradas e histórico; depois validar no navegador com o leitor real.

## Decisões adotadas na implementação

- Markup fica configurado individualmente em cada produto; inicia em 0% e pode ser editado no cadastro.
- No cadastro, usar o botão **Usar preço sugerido** para copiar o cálculo ao preço de venda. Na entrada, a atualização do preço exige marcar a caixa de confirmação.
- Fornecedor e nota fiscal são opcionais e ficam registrados quando informados.
- `cost_cents` é tratado como custo médio vigente; as vendas continuam salvando uma cópia desse custo em cada item vendido.

## Critérios para considerar concluído

- Escanear o código localiza o produto correto e mostra categoria, preço e estoque vindos do banco.
- Confirmar uma entrada incrementa estoque e recalcula custo médio corretamente, sem perder movimentações concorrentes.
- O histórico permite identificar quem lançou cada compra, quando, quantidade e custo.
- O preço sugerido segue o markup exibido e o preço de venda só muda mediante confirmação explícita.
- Uma venda posterior grava o custo médio daquele momento; entradas futuras não modificam vendas antigas.
- O processo é validado com leitor físico e uma entrada de teste controlada antes de uso operacional.

## Entregue nesta implementação

- Migração `backend/database/migrations/20261010000100_markup_and_stock_receipts.sql`: markup por produto e campos de auditoria de compra em `stock_movements`; aplicada ao banco Supabase configurado para este checkout sem alterar os saldos existentes.
- Cadastro de produtos com markup persistido e botão para usar o preço sugerido.
- Entrada de mercadoria por código de barras/SKU, cálculo de custo médio ponderado, preço sugerido, opção de atualizar o preço, fornecedor/nota opcionais e histórico.
- Testar a leitura física e uma entrada controlada pela interface antes do uso diário.
