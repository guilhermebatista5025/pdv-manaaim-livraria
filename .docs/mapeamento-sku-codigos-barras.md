# Mapeamento de SKU e código de barras — Livraria Manaaim

**Data do mapeamento:** 10/10/2026
**Escopo:** produtos ativos do catálogo Supabase.

## Regra aplicada

Para cada produto ativo que ainda não tinha identificadores, foi criado um SKU interno no padrão `MAN-` + ID do produto com cinco dígitos. O campo **Código de barras** recebeu o mesmo valor do SKU. Exemplo: `MAN-00002`.

O PDV gera a etiqueta desse valor em **Code 128** com JsBarcode. Esses códigos são internos da Livraria Manaaim; não são GTIN/EAN/UPC oficiais nem substituem ISBN ou código original do fabricante. Para localizar a venda, o sistema aceita o código de barras ou o SKU.

## Catálogo mapeado

| ID | Produto | Categoria | SKU | Código de barras |
|---:|---|---|---|---|
| 2 | Biblia Slim Preta | Biblia | `MAN-00002` | `MAN-00002` |
| 3 | Biblia Letra Gigante Rosa | Biblia | `MAN-00003` | `MAN-00003` |
| 4 | Biblia Letra Grande Preta | Biblia | `MAN-00004` | `MAN-00004` |
| 5 | Biblia Letra Gigante Azul | Biblia | `MAN-00005` | `MAN-00005` |
| 6 | Biblia Letra Gigante Preta | Biblia | `MAN-00006` | `MAN-00006` |
| 7 | Biblia Letra Grande Vinho | Biblia | `MAN-00007` | `MAN-00007` |
| 8 | Biblia Letra Grande Rosa | Biblia | `MAN-00008` | `MAN-00008` |
| 9 | Biblia Pequena sem Marcador | Biblia Menor | `MAN-00009` | `MAN-00009` |
| 10 | Coletanea Cifrada Nivel || | Coletania | `MAN-00010` | `MAN-00010` |
| 11 | Bloco Dons | Blocos | `MAN-00011` | `MAN-00011` |
| 12 | Bloco Louvores c/03 | Blocos | `MAN-00012` | `MAN-00012` |
| 13 | Livro Salvação Ato e Processo 1 | Livros | `MAN-00013` | `MAN-00013` |
| 14 | Livro Salvação Ato e Processo 2 | Livros | `MAN-00014` | `MAN-00014` |
| 15 | Livro Resumo Historico, Profetico 1 | Livros | `MAN-00015` | `MAN-00015` |
| 16 | Livro Resumo Historico, Profetico 2 | Livros | `MAN-00016` | `MAN-00016` |
| 17 | Livro Jornada de Abraão | Livros | `MAN-00017` | `MAN-00017` |
| 18 | Livro Esdras | Livros | `MAN-00018` | `MAN-00018` |
| 19 | Livro Momento da Doutrina | Livros | `MAN-00019` | `MAN-00019` |
| 20 | Livro de Ester | Livros | `MAN-00020` | `MAN-00020` |
| 21 | Livro de Jesus no Novo Testamento | Livros | `MAN-00021` | `MAN-00021` |
| 22 | Livro de Rute | Livros | `MAN-00022` | `MAN-00022` |
| 23 | Livro Colhendo Trigo V|| | Livros | `MAN-00023` | `MAN-00023` |
| 24 | Livro Colhendo Trigo V||| | Livros | `MAN-00024` | `MAN-00024` |
| 25 | Livro de Habacuque | Livros | `MAN-00025` | `MAN-00025` |
| 26 | Livro Imposição das Mãos | Livros | `MAN-00026` | `MAN-00026` |
| 27 | Livro Sete Cartas do Apocalipse | Livros | `MAN-00027` | `MAN-00027` |
| 28 | Livro Jesus na Ecologia | Livros | `MAN-00028` | `MAN-00028` |
| 29 | Livro Graça e Fé | Livros | `MAN-00029` | `MAN-00029` |
| 30 | Livro Fundamentos da Obra | Livros | `MAN-00030` | `MAN-00030` |
| 31 | Livro Entre o Portico e o Autar | Livros | `MAN-00031` | `MAN-00031` |
| 32 | Livro a Vida no Verbo | Livros | `MAN-00032` | `MAN-00032` |
| 33 | Orientações das Senhoras | Outros | `MAN-00033` | `MAN-00033` |
| 34 | Livro Sobre Israel | Livros | `MAN-00034` | `MAN-00034` |
| 35 | Livro Cantares de Salomão | Livros | `MAN-00035` | `MAN-00035` |
| 36 | Livro Diaconato | Livros | `MAN-00036` | `MAN-00036` |
| 37 | Livro a Palavra de Deus | Livros | `MAN-00037` | `MAN-00037` |
| 38 | Livro Direito de Acesso a Jesus | Livros | `MAN-00038` | `MAN-00038` |
| 39 | Livro Ateísmo e Desvio do Crist. | Livros | `MAN-00039` | `MAN-00039` |
| 40 | Livro Ciencia e Fé | Livros | `MAN-00040` | `MAN-00040` |
| 41 | Livro o Louvor da Igreja Fiel | Livros | `MAN-00041` | `MAN-00041` |
| 42 | Livro Razão e Revelação | Livros | `MAN-00042` | `MAN-00042` |
| 43 | Livro Cristianismo Mesclado | Livros | `MAN-00043` | `MAN-00043` |
| 44 | Livro Organização e Metodo | Livros | `MAN-00044` | `MAN-00044` |
| 45 | Livro Doutrina e Ensino | Livros | `MAN-00045` | `MAN-00045` |
| 46 | Livro Ministerio Novo Testamento | Livros | `MAN-00046` | `MAN-00046` |
| 47 | Apostila Acessibilidade | Apostila | `MAN-00047` | `MAN-00047` |
| 48 | Apostila CIAS | Apostila | `MAN-00048` | `MAN-00048` |
| 49 | Apostila Grupo de Louvor | Apostila | `MAN-00049` | `MAN-00049` |
| 50 | Apostila Ensino de Crianças | Apostila | `MAN-00050` | `MAN-00050` |
| 51 | Livro Gideão | Livros | `MAN-00051` | `MAN-00051` |
| 52 | Adesivo ICM Pequeno | Adesivos | `MAN-00052` | `MAN-00052` |
| 53 | Adesivo ICM Grande | Adesivos | `MAN-00053` | `MAN-00053` |
| 54 | Lapis Personalizados | Lapis | `MAN-00054` | `MAN-00054` |
| 55 | Caneta Bic Azul | Canetas | `MAN-00055` | `MAN-00055` |
| 56 | Jacarezinho | Outros | `MAN-00056` | `MAN-00056` |
| 57 | Cordinha Vermelha | Cordas | `MAN-00057` | `MAN-00057` |
| 58 | Cordinha Preta | Cordas | `MAN-00058` | `MAN-00058` |
| 59 | Cordinha Azul | Cordas | `MAN-00059` | `MAN-00059` |
| 60 | Cordinha Branca | Cordas | `MAN-00060` | `MAN-00060` |
| 61 | Cordinha Rosa | Cordas | `MAN-00061` | `MAN-00061` |
| 62 | Cordinha Cinza | Cordas | `MAN-00062` | `MAN-00062` |
| 63 | Cordinha Roxa | Cordas | `MAN-00063` | `MAN-00063` |
| 64 | Cordinha Autista | — | `MAN-00064` | `MAN-00064` |
| 65 | Moldura ICM Vermelho | Molduras | `MAN-00065` | `MAN-00065` |
| 66 | Moldura ICM Branco | Molduras | `MAN-00066` | `MAN-00066` |
| 67 | Capa Bíblia Marron | Capas | `MAN-00067` | `MAN-00067` |
| 68 | Capa Bíblia Preta | Capas | `MAN-00068` | `MAN-00068` |
| 69 | Livro Expressão da Alma Remida | Livros | `MAN-00069` | `MAN-00069` |
| 70 | Livro Jesus no Novo Testamento | Livros | `MAN-00070` | `MAN-00070` |

## Pendências para fechar o fluxo com segurança

1. **Conferir códigos das embalagens e ISBNs.** As etiquetas internas funcionam para o estoque da loja, mas, quando o livro/produto já tem ISBN ou GTIN, vale cadastrar o código original para também ler a embalagem. Não inventar GTIN/EAN/UPC.
2. **Revisar o produto sem categoria:** ID 64, “Cordinha Autista”. Confirmar a categoria correta.
3. **Distinguir os dois títulos parecidos:** ID 21, “Livro de Jesus no Novo Testamento”, e ID 70, “Livro Jesus no Novo Testamento”. Confirmar se são edições/produtos distintos e completar autor/edição no nome ou descrição. Os SKUs distintos evitam colisão, mas não resolvem essa ambiguidade do catálogo.
4. **Gerar e imprimir etiquetas.** Os códigos foram salvos, mas cada etiqueta precisa ser impressa e aplicada ao item correto; conferir se impressão, tamanho e contraste estão bons.
5. **Teste final no PDV.** Com um produto salvo e o caixa aberto, escanear a etiqueta em “Nova venda”. O leitor já foi confirmado no Notepad como teclado com Enter; falta confirmar o fluxo completo de etiqueta → produto → carrinho.

## Observação sobre o teste anterior do leitor

O registro inativo ID 71 (“BIBLIA DE ESTUDO TESTE”) ainda contém o SKU `MAN-TESTE-001` e o código `48041018864`, que veio da caixa do leitor. Esse código **não foi reutilizado** nos produtos ativos. Não reative esse registro nem trate esse número como código de um produto da loja; antes de reativá-lo, revise o cadastro e remova/corrija o código da caixa.

## Situação após o mapeamento

- 69 produtos ativos agora têm SKU e código interno preenchidos.
- Os 69 SKUs e os 69 códigos de barras são únicos entre os produtos ativos.
- Nenhum produto ativo ficou com preço zero na conferência.
- 1 produto ativo está sem categoria (ID 64).
- Os códigos foram gravados no catálogo Supabase; o arquivo documenta exatamente a regra e os valores atribuídos.
- A validação física das etiquetas e a leitura dentro de uma venda ainda precisam ser feitas com a impressora/leitor da loja.
