# CHECKPOINT CONSULTA DE AJUSTES

**Data:** 03/11/2026  
**Projeto:** Painel de Ajustes  
**GitHub:** https://github.com/paineldeajustes/site-consulta-convenios  
**Site:** https://paineldeajustes.github.io/site-consulta-convenios/  
**Supabase:** `qkjudfvlaatdcaosadun`

## Estado vigente

A aplicação foi revertida para usar exclusivamente:
- `RET_FONTES.txt`: empenhos, OP/pagamentos, valores por fonte, custeio/capital e datas;
- `CadConvenios.txt`: cadastro e metadados dos ajustes.

Não existe mais dependência dos arquivos separados `TXT_EMPENHO` e `TXT_PAGAMENTO`. A função `import-orcom-movements` está desativada (v28, HTTP 410).

## Alterações concluídas

- Frontend atualizado para montar empenhos e pagamentos das posições RET.
- Detalhe de documentos abre a partir das linhas RET carregadas para o ajuste, sem consultar tabela histórica ORCOM.
- Filtros e paginação de 100 linhas mantidos no navegador.
- Exportação CSV mantida para os pagamentos do RET.
- Catálogo permanente preservado: 1.237 números, uma única coluna e sem dados pessoais.
- View `orcom_adjustment_selection` passou a juntar catálogo, Cad e valores do RET; sem referência a movimentos ORCOM.
- `refresh_orcom_adjustment_selection_snapshot()` agora atualiza apenas o snapshot; não recria nem modifica o catálogo.
- Importador Cad v13 atualiza o snapshot após importação bem-sucedida.
- Workflow diário executa somente RET_FONTES e CadConvenios, às 06:00 de Brasília.
- Skin profissional mantida.
- Removidas tabelas `orcom_movement_rows` e `orcom_file_imports`, funções de movimento e view de resumo de movimento.
- Histórico das importações RET/Cad preservado; somente as linhas físicas antigas das versões substituídas são removidas após sucesso.

## Verificações do Supabase

Último workflow diário concluído: **41563858822 — success**.

| Item | Resultado confirmado |
|---|---:|
| RET_FONTES.txt | 1.153 linhas |
| CadConvenios.txt | 8.318 registros |
| Snapshot da seleção | 1.237 linhas |
| Catálogo permanente | 1.237 números |
| Tabela orcom_movement_rows | removida |
| Tabela orcom_file_imports | removida |
| View orcom_adjustment_movement_summary | removida |

Teste de banco com o ajuste `00004/2021-SE`:
- Cadastrado inicial: R$ 142.782,55
- Empenhado via RET: R$ 142.782,55
- Pago informado no RET: R$ 142.782,55
- Registros: 4 empenhos e 6 OP/pagamentos

Atenção: RET_FONTES não tem os mesmos marcadores de O/R, cancelamento, anulação e validade dos TXT separados. Não chamar os pagamentos de “válidos O/R”. O total pago na tela é o que está informado no RET.

## Espaço liberado

- Antes: 1.030.821.555 bytes (aprox. 983 MB).
- Depois: 77.829.811 bytes (aprox. 74 MB).
- Redução: 952.991.744 bytes (aprox. 909 MB).

A redução ocorreu por exclusão física das tabelas grandes de movimentos ORCOM. Catálogo e snapshot permaneceram.

## Versões e migrações

- `import-ret-fontes` v14.
- `import-cad-convenios` v13.
- `import-orcom-movements` v28 — stub desativado.
- Migração `20261103020350_selection_from_ret_fontes_only`.
- Migração `20261103020643_remove_orcom_movement_txt_storage`.
- Migração `20261103021119_selection_view_security_invoker` — view usa `security_invoker=true`.
- SQL das migrações está em `supabase/migrations/`.

## Pendências reais

1. Aguardar o DTI corrigir o arquivo RET_FONTES.txt; o último importado tinha 1.153 linhas.
2. Quando o arquivo corrigido estiver no Drive, executar `workflow_dispatch` no workflow `Importar RET_FONTES e CadConvenios diariamente` e confirmar que o snapshot concluiu com 1.237 linhas.
3. Testar o site com sessão autenticada: abrir ajuste, conferir empenhos, OPs, filtros, paginação, detalhe dos documentos, conciliação e CSV.
4. GitHub Pages do commit de código `a3be76b93dbfff19f711a542d6fdecf48ed13bf7` concluído com sucesso (run `41564268264`).

## Comando para o próximo chat

```text
Continue o Painel de Ajustes no repositório paineldeajustes/site-consulta-convenios. Leia CONTINUIDADE_CONSULTA_DE_AJUSTES.md e CHECKPOINT_CONSULTA_DE_AJUSTES.md. Não reintroduza TXT_EMPENHO/TXT_PAGAMENTO; use somente RET_FONTES.txt e CadConvenios.txt. Preserve o catálogo permanente de 1.237 números. Confirme os deploys e o estado real do Supabase, e siga a pendência de validação após a correção do RET_FONTES pelo DTI.
```
