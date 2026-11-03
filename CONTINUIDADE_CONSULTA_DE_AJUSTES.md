# Continuidade — Painel de Ajustes

**Estado vigente:** 03/11/2026  
**Repositório:** https://github.com/paineldeajustes/site-consulta-convenios  
**Site:** https://paineldeajustes.github.io/site-consulta-convenios/  
**Supabase:** `qkjudfvlaatdcaosadun` — `https://qkjudfvlaatdcaosadun.supabase.co`

> Este documento substitui as descrições anteriores que dependiam dos arquivos ORCOM. A arquitetura vigente usa exclusivamente `RET_FONTES.txt` e `CadConvenios.txt`. Não reintroduzir dependência dos arquivos `TXT_EMPENHO` ou `TXT_PAGAMENTO`.

## Regra de continuidade

Quando o usuário enviar exatamente **CHECKPOINT CONSULTA DE AJUSTES**, consultar o estado real do GitHub, Pages, Edge Functions, importações e tabelas do Supabase; atualizar este documento e `CHECKPOINT_CONSULTA_DE_AJUSTES.md`; registrar commits, migrations, verificações e pendências; entregar o comando de retomada abaixo. Não descrever como concluído o que não foi verificado.

Antes de qualquer alteração futura, ler estes dois arquivos e confirmar o HEAD atual da branch `main`.

## Arquitetura vigente: somente duas fontes

1. **`RET_FONTES.txt`**: fonte exclusiva dos dados de empenho e OP/pagamentos, além dos registros de valores e fontes do ajuste.
2. **`CadConvenios.txt`**: fonte dos dados cadastrais, entidade, número, ano, letra, situação `AJUSTE2`, processo, objeto e vigência.

Os dois arquivos são importados do Google Drive pelas Edge Functions. As linhas dos dois arquivos ficam em `public.ret_fontes_rows`; o histórico de importações fica em `public.ret_fontes_imports`, identificado por `file_name`. O Cad é armazenado em `fields` como objeto JSON; o RET é armazenado como array JSON posicional.

A rotina diária do GitHub Actions está em `.github/workflows/import-ret-fontes-diario.yml`. Roda às 09:00 UTC (06:00 no horário de Brasília), primeiro importa RET_FONTES e depois CadConvenios. A função de Cad atualiza o snapshot da consulta somente após concluir a importação e a limpeza da versão anterior. O workflow não lista, baixa nem importa arquivos TXT_EMPENHO/TXT_PAGAMENTO. Também pode ser iniciado manualmente por `workflow_dispatch`.

Os importadores continuam reimportando os arquivos em cada ciclo, mesmo que o conteúdo seja igual, conforme a regra temporária de teste definida pelo usuário. Após a nova importação ser concluída com sucesso, as linhas físicas da versão anterior daquele arquivo são apagadas; os registros de histórico permanecem.

## Estrutura posicional conhecida do RET_FONTES

O array de 27 posições usado pela tela segue este mapeamento:

| Índice | Campo lógico |
|---:|---|
| 0 | CONVENIO |
| 1 | ENTIDADE |
| 2 | TIPOAD |
| 3 | NUMEROAD |
| 4 | TPCAD |
| 5 | TPFOTE |
| 6 | VL-BEM |
| 7 | VL-CUSTEIO |
| 8 | VL-REFORMA |
| 9 | EMPENHO |
| 10 | VALOR-NE |
| 11 | VALOR CUSTEIO |
| 12 | VALOR CAPITAL |
| 13 | FONTE-NE |
| 14 | ANO |
| 15 | MES |
| 16 | DIA |
| 17 | OP |
| 18 | EMPENHO_1 |
| 19 | VALOR-OP |
| 20 | VALOR CUSTEIO_2 |
| 21 | VALOR CAPITAL_3 |
| 22 | FONTE-NE_4 |
| 23 | ANO_5 |
| 24 | MES_6 |
| 25 | DIA_7 |
| 26 | Column1 (vazio na versão conferida) |

A tela lê as linhas RET correspondentes ao ajuste selecionado, monta as listas de empenhos e pagamentos localmente no navegador e mantém paginação de 100 registros. Empenhos vêm das posições 9–16; pagamentos/OP das posições 17–25. Para pagamentos, a tela considera o exercício 2020 em diante, como na regra histórica de consulta. A data é montada a partir de ANO_5/MES_6/DIA_7.

**Limite importante dos dados:** o RET_FONTES usado nesta versão não apresenta os mesmos marcadores de O/R, cancelamento, anulação e validade que existiam nos TXT separados. Não classificar estes pagamentos como “válidos O/R”, não inventar status e não reconstruir indicadores de cancelamento sem campo correspondente. A tela e os totais os identificam como pagamentos informados no RET_FONTES. O campo interno legado `total_pago_valido` do snapshot é apenas um nome de compatibilidade e, neste modelo, recebe o total informado no RET; não representa validação contábil.

## Catálogo permanente dos números

- `public.orcom_adjustment_catalog` continua com exatamente **1.237 números**, na única coluna `adjustment_number`.
- O catálogo foi preservado durante a reversão e não depende dos TXT de empenho/pagamento.
- Os 1.237 números foram conferidos com os 1.237 registros correspondentes do Cad atual classificados como `AJUSTE2 = CONCEDIDO`.
- A tabela não armazena movimento, cadastro pessoal, dados de contato nem dados cadastrais completos.
- A tela busca metadados do ajuste depois que o usuário escolhe o número.
- Não reconstruir o catálogo a partir dos arquivos de movimentos, nem apagar ou renumerar sua lista sem solicitação explícita.

Por compatibilidade, alguns objetos mantêm o prefixo `orcom_`: `orcom_adjustment_catalog`, `orcom_adjustment_selection`, `orcom_adjustment_selection_snapshot` e RPCs de seleção/metadados. Eles agora suportam apenas catálogo, metadados e resumo calculado a partir de RET/Cad. O prefixo não significa que dependam de arquivos ORCOM.

## Objetos removidos

Foram removidos fisicamente do projeto Supabase:
- `public.orcom_movement_rows` — linhas importadas dos TXT_EMPENHO/TXT_PAGAMENTO;
- `public.orcom_file_imports` — histórico específico desses arquivos;
- view `orcom_adjustment_movement_summary`;
- funções `orcom_adjustment_movement_context` e `orcom_adjustment_movement_page`.

A Edge Function `import-orcom-movements` foi convertida em stub desativado (HTTP 410). Não usar nem reativar. O arquivo de implementação no GitHub também é um stub com a mesma resposta.

## Estado confirmado no Supabase em 03/11/2026

Importação diária finalizada com sucesso no workflow **41563858822**:
- RET_FONTES: 1.153 linhas, status `success`;
- CadConvenios: 8.318 registros, status `success`;
- snapshot: 1.237 registros, sucesso;
- catálogo: 1.237 números, preservados.

A consulta individual do ajuste **00004/2021-SE** foi conferida no banco usando o RET: total cadastrado inicial **R$ 142.782,55**, empenhado **R$ 142.782,55**, pago informado no RET **R$ 142.782,55**, quatro registros de empenho e seis de OP/pagamento. A conferência confirma que as colunas RET estão alimentando o resumo.

### Espaço no banco

Antes da exclusão, a medição registrada do banco era **1.030.821.555 bytes (aprox. 983 MB)**. Após excluir as duas tabelas grandes, a medição foi **77.829.811 bytes (aprox. 74 MB)**: redução líquida de **952.991.744 bytes (aprox. 909 MB)**.

Medições posteriores:
- `ret_fontes_rows`: 55.721.984 bytes (aprox. 53 MB);
- `ret_fontes_imports`: 32 KB;
- `orcom_adjustment_selection_snapshot`: 3.096.576 bytes (aprox. 3 MB);
- `orcom_adjustment_catalog`: 200 KB.

Foi confirmado que `to_regclass` retorna NULL para `orcom_movement_rows`, `orcom_file_imports` e `orcom_adjustment_movement_summary`. O banco é compartilhado com outros recursos, inclusive Clareza; não alterar tabelas/functions dessas outras aplicações.

## Edge Functions e workflow

- `import-ret-fontes`: ativa, versão 14.
- `import-cad-convenios`: ativa, versão 13; depois de importar e limpar as linhas antigas, executa `refresh_orcom_adjustment_selection_snapshot()` e informa sucesso/erro desse refresh na resposta.
- `import-orcom-movements`: versão 28, stub desativado; responde HTTP 410.
- Workflow `Importar RET_FONTES e CadConvenios diariamente`: run **41563858822**, concluído com sucesso. O log confirma as duas importações e `snapshot_refresh.success=true`, `row_count=1237`, `catalog_count=1237`.

## Migrações registradas

- `20261103020350_selection_from_ret_fontes_only`: view e refresh do snapshot passaram a usar Cad + RET e catálogo congelado.
- `20261103020643_remove_orcom_movement_txt_storage`: remoção de views, funções e tabelas de movimentos ORCOM.

Arquivos correspondentes em `supabase/migrations/`:
- `20261103020350_selection_from_ret_fontes_only.sql`
- `20261103020643_remove_orcom_movement_txt_storage.sql`

## GitHub e interface

- `index.html`: interface atualizada; usa RET_FONTES para empenhos/pagamentos, mantém catálogo de um único seletor, paginação de 100 linhas, exportação CSV e skin profissional.
- A lógica de busca/seleção dos 1.237 números e o metadado por número foram mantidos.
- Removidos da interface os rótulos O/R, dt-bo e referências às antigas tabelas/funções de movimentos. Os scripts inline foram validados sintaticamente.
- Workflow atualizado para as duas fontes.
- Último commit de código da interface: `a3be76b93dbfff19f711a542d6fdecf48ed13bf7`.
- O Pages build desse commit estava em fila na última consulta; confirmar o status do deploy após os últimos commits/documentação.

**Validação ainda pendente:** teste funcional com uma sessão autenticada no navegador (seleção, abertura de ajuste, filtros, paginação, detalhe da OP/empenho e CSV). Também aguardar o DTI corrigir/substituir o RET_FONTES; quando houver o arquivo corrigido, executar o workflow manualmente ou esperar o ciclo diário e repetir conferência de contagens e valores.

## Próxima ação quando o DTI corrigir RET_FONTES

1. Confirmar que a fonte compartilhada no Drive aponta para o RET_FONTES corrigido.
2. Executar o workflow `Importar RET_FONTES e CadConvenios diariamente` via `workflow_dispatch` ou aguardar 06:00.
3. Confirmar `success` das duas importações e `snapshot_refresh.success=true`, `row_count=1237`, `catalog_count=1237`.
4. Testar no navegador autenticado um ajuste com NE/OP, por exemplo `00004/2021-SE`, e conferir um ajuste sem linhas RET.
5. Não restaurar nem importar TXT_EMPENHO/TXT_PAGAMENTO.

## Comando para iniciar outro chat

```text
Continue o Painel de Ajustes pelo repositório paineldeajustes/site-consulta-convenios. Leia primeiro CONTINUIDADE_CONSULTA_DE_AJUSTES.md e CHECKPOINT_CONSULTA_DE_AJUSTES.md. A arquitetura vigente usa somente RET_FONTES.txt e CadConvenios.txt; não reintroduza TXT_EMPENHO/TXT_PAGAMENTO. Preserve o catálogo de 1.237 números. Confirme o estado real do GitHub, do Pages, das Edge Functions e do Supabase antes de continuar. Acompanhe a correção do RET_FONTES pelo DTI e valide a consulta quando o arquivo corrigido for importado.
```
