# ARQUITETURA VIGENTE — CONSULTA DE AJUSTES 2.0 (04/11/2026)

> Este bloco substitui as instruções operacionais da versão anterior presentes abaixo. A interface legada é apenas um backup. Não restaurar sua arquitetura de consulta sem autorização explícita.

## Aplicação e repositório

- **Endereço principal:** https://paineldeajustes.github.io/site-consulta-convenios/
- **Versão 2.0 independente (mesmo conteúdo):** https://paineldeajustes.github.io/site-consulta-convenios/v2/
- **Backup reversível da interface anterior:** https://paineldeajustes.github.io/site-consulta-convenios/legacy/
- **GitHub:** paineldeajustes/site-consulta-convenios, branch main
- **Supabase:** qkjudfvlaatdcaosadun
- **Arquivos de interface:** index.html (V2 publicada), v2/index.html (cópia V2), legacy/index.html (cópia da V1)
- **Migration versionada:** supabase/migrations/20261104154500_panel_v2_precomputed_instant_cache.sql
- **Commit da migração:** 27024b20707fa4c6677044c5f81833d95437d1af
- **Commit de publicação principal:** 0e69a51b33952f278e3176c6d66e4d5396560a0e

## Escolha de arquitetura

A V2 foi desenvolvida do zero, sem reaproveitar a estrutura de renderização dinâmica da V1. As duas únicas fontes de dados continuam:
1. RET_FONTES.txt (atual: 1.153 linhas, dados de cadastro por fonte, empenhos e OPs)
2. CadConvenios.txt (atual: 8.318 registros, cadastro, entidade, objeto, processo, vigência e situação)

**Depois de importar ambos, o banco pré-calcula todo o conteúdo que o navegador precisa.** A execução diária utiliza a função já existente refresh_orcom_adjustment_selection_snapshot(), agora integrada à nova refresh_panel_v2_cache(). Ela substitui atomicamente as 1.237 linhas de public.panel_v2_cache, mantendo o catálogo principal como fonte dos 1.237 números e sem depender de TXT_EMPENHO/TXT_PAGAMENTO.

O navegador chama **uma única RPC** \`public.panel_v2_bundle()\` depois de autenticar e obtém um JSON com todos os ajustes e detalhes. Em seguida, pesquisas, seleção de ajustes, métricas, navegação entre abas, filtros e exportação CSV ocorrem **100% localmente, sem consulta ao Supabase a cada clique**. A interface evita as requisições paralelas, consultas de metadados, reparsing do TXT e estado complexo que travavam a V1.

A tabela nova tem **aproximadamente 912 KB** incluindo índices. A função retornou **878.796 bytes** no teste de tamanho do JSON. Medição SQL \`EXPLAIN ANALYZE SELECT public.panel_v2_bundle()\`: **aproximadamente 60 ms de execução no banco**. Esses tempos NÃO incluem rede, autenticação ou renderização; não prometer tempos fixos em dispositivos e conexões de usuários.

## Estrutura de banco e autorização

- \`public.panel_v2_cache(adjustment_number PRIMARY KEY, payload jsonb, refreshed_at)\`, RLS habilitado.
- A policy SELECT só permite contas **ativas e presentes em public.panel_users**, usando e-mail confiável de auth.jwt(); somente papel \`authenticated\` recebe SELECT.
- \`public.panel_v2_bundle()\` é \`SECURITY INVOKER\`, não expõe o banco a \`anon\`.
- \`public.panel_v2_money(text)\`: normalização numérica posicional do RET.
- \`public.refresh_panel_v2_cache()\`: reconstrução administrativa, \`SECURITY DEFINER\`, EXECUTE concedido exclusivamente a \`service_role\` (mais privilégio inerente do proprietário), sem acesso anônimo.
- \`public.refresh_orcom_adjustment_selection_snapshot()\`: também atualiza a cache V2 ao fim do refresh histórico; usado pelo importador CadConvenios.
- Verificação de permissões simulando papel authenticated: e-mail autorizado retornou 1.237 registros; outro e-mail retornou zero. \`anon\` não tem privilégio EXECUTE na RPC.
- A nova cache publica só campos cadastrais previamente selecionados (número, entidade, processo, objeto, tipo, datas) e valores/linhas financeiras permitidos; não transporta campos pessoais extras do cadastro.
- Não alterar as tabelas e funções de Clareza neste mesmo Supabase.

## Interface

- Layout completamente novo, responsivo, com busca instantânea, lista de ajustes à esquerda e quatro abas: Panorama, Empenhos, Pagamentos, Cadastro e fontes.
- Pesquisa por número ou entidade, filtro por ajustes com dados financeiros, filtros locais por ano/fonte/documento, download de CSV.
- Aviso explícito quando o RET não possui linhas: cadastro do CadConvenios continua disponível; **não exibir zero como execução financeira comprovada**.
- O painel mantém os 1.237 números. A lista inicial renderiza só os 120 primeiros para não sobrecarregar a tela; a busca local pesquisa os 1.237, sem paginação no Supabase.
- Biblioteca Supabase JS fixada em \`2.118.0\`; somente chave pública no frontend. Login existente mantido via Supabase Auth.

## Testes realizados

1. \`refresh_panel_v2_cache()\`: sucesso, 1.237 registros.
2. \`refresh_orcom_adjustment_selection_snapshot()\`: sucesso, 1.237 no snapshot e na V2.
3. Ajuste 00004/2021-SE: total cadastrado, empenhado e pago informado no RET de R$ 142.782,55, com 4 NE e 6 OP.
4. Ajuste 00028/2022-FSS: cadastro válido, sem movimentos no RET atual. A V2 informa indisponibilidade financeira, mas apresenta objeto, entidade e processo.
5. Script JavaScript passou em validação de sintaxe.
6. Teste automatizado em DOM simulado: entrada autenticada, exibição do catálogo, alternância entre dois ajustes, aviso de falta de dados e **nenhuma requisição de rede adicional ao trocar de ajuste**.
7. Auditoria Supabase após migração: nenhum alerta novo para objetos \`panel_v2\`.

## Limites conhecidos e pendências

- O RET_FONTES atual (1.153 linhas) contempla movimento financeiro para apenas **12 dos 1.237 ajustes**; o arquivo precisa de correção pelo DTI. Não é falha que possa ser resolvida na interface sem dados na fonte.
- Os arquivos separados TXT_EMPENHO/TXT_PAGAMENTO continuam desativados e suas tabelas antigas permanecem removidas.
- O RET não traz marcadores que permitam validar com segurança O/R, anulação/cancelamento ou conciliação bancária. Tratar valores pagos como **informados pelo RET**, não como pagos líquidos auditados.
- Teste de autenticação e interação no **navegador real do usuário** ainda necessário; os testes de frontend foram feitos em DOM simulado e o banco foi testado diretamente. Verificar estado do deployment do commit atual via GitHub Actions antes de afirmar que está ao vivo.
- Não reintroduzir recarga de dados a cada seleção. Não reintroduzir o modelo de TXT separado.

## Comando de continuidade

\`\`\`text
Continue a Consulta de Ajustes 2.0 no repositório paineldeajustes/site-consulta-convenios. Leia os blocos V2 no início de CONTINUIDADE_CONSULTA_DE_AJUSTES.md e CHECKPOINT_CONSULTA_DE_AJUSTES.md. Confira o deployment GitHub Pages e o cache public.panel_v2_cache (1.237 itens). Use somente RET_FONTES.txt e CadConvenios.txt. Preserve a UI nova, seus filtros e a RPC única panel_v2_bundle. Não reintroduza o fluxo antigo de consultas. Faça teste funcional autenticado real e verifique se o DTI corrigiu o RET_FONTES antes de discutir ausência de dados de movimentos. Não altere recursos do Clareza.
\`\`\`

---

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
