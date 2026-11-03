# CHECKPOINT CONSULTA DE AJUSTES

**Checkpoint:** 02/11/2026 — Painel de Ajustes  
**Repositório:** \`paineldeajustes/site-consulta-convenios\`  
**Site:** https://paineldeajustes.github.io/site-consulta-convenios/

## O que foi implementado nesta etapa

- Importação ORCOM recuperável em blocos (1.000 linhas por chamada, 250 por INSERT).
- Workflow diário ajustado para timeout de 120 minutos.
- View \`orcom_adjustment_selection\`: somente \`AJUSTE2 = CONCEDIDO\` com pagamentos O/R em 2020+.
- Tela alterada para carregar o índice/resumo de ajustes e buscar linhas RET/ORCOM apenas ao selecionar um ajuste.
- Filtros por ano do ajuste e por letra/sufixo.
- Botão **Limpar seleção**.
- Filtros de colunas de empenho e pagamento convertidos para listas suspensas.
- Índices e RLS otimizados; consulta da view caiu de ~60,6s para ~3,77s no banco.

## Estado dos arquivos

- 14/14 arquivos ORCOM de empenho/pagamento (2020–2026) em status \`success\`.
- CadConvenios: 8.318 registros na última importação.
- RET_FONTES: 1.153 registros na última importação; 51 chaves.
- View de seleção: 1.237 ajustes elegíveis.
- A lista continua podendo conter ajustes com ano anterior a 2020 quando existem pagamentos O/R em 2020+; a regra se refere ao exercício do pagamento, não ao ano de criação do ajuste.

## Regra de continuidade

Quando o usuário escrever **CHECKPOINT CONSULTA DE AJUSTES**, atualizar estes dois arquivos no GitHub imediatamente com o estado real e entregar um comando de retomada para outro chat.

## Comando para o próximo chat

\`\`\`text
Continue o projeto Painel de Ajustes no repositório paineldeajustes/site-consulta-convenios. Leia CONTINUIDADE_CONSULTA_DE_AJUSTES.md e CHECKPOINT_CONSULTA_DE_AJUSTES.md. Confirme no GitHub e no Supabase os commits, deploy, versões das Edge Functions e status dos arquivos importados. Continue pelos testes da interface e corrija qualquer problema encontrado, sem repetir importações concluídas.
\`\`\`

## Pendências de validação em navegador

- Autenticar e testar a seleção por ano/letra e a busca por entidade.
- Testar ajuste com linha RET existente (ex.: 00004/2021-SE).
- Testar ajuste recente sem linha no RET mais recente (ex.: exercício 2026).
- Confirmar a mensagem de ausência RET, botão limpar, filtros suspensos, Overview, CSV e ficha.
- Medir o tempo real do navegador após login; a consulta no banco foi medida em ~3,77s.

## Segurança e integridade

Não expor service-role, segredo de importação ou credenciais Google. Não excluir dados com status \`success\`. Há 28.000 linhas residuais em três registros de importação antigos \`failed\`; a seleção filtra explicitamente apenas imports \`success\`, então os resíduos não entram nos cálculos.


## Incidente de login e logout — 02/11/2026

O usuário autenticou com a conta institucional, mas o painel exibiu `Cannot access 'retFontesImportId' before initialization`; a lista de ajustes não carregou e o botão **Sair da conta** não respondia. A causa era a inicialização tardia das variáveis de estado e o registro tardio do listener de logout. Também faltava a definição global de `RET_SCHEMA` (26 colunas), usada pela nova leitura sob demanda.

Correções em `index.html`:
- Estados globais movidos para antes das rotinas de carga.
- Constante global `RET_SCHEMA` restaurada com 26 colunas.
- Listener de logout antecipado, com saída local e limpeza da interface no `finally`.
- Botão Mostrar/Ocultar senha isolado e eventos de autenticação antecipados.

Último commit de código: `f6fbe35c5d135b1773a5782be4f025f47edbf887`. GitHub Pages run `41543569107`: `completed / success` em 02/11/2026 23:13 UTC. Sintaxe dos scripts validada; **pendente teste funcional no Safari do iPhone** para confirmar login, carregamento dos ajustes, botão de senha e logout.


## Auditoria de continuidade — 02/11/2026 (20:30, horário de Brasília)

- HEAD atual de `main`: `4cc6c3ad740c6785af9dc7d9b0e2ded6496e9243`. O último commit sincronizou a cópia do GitHub de `import-ret-fontes/index.ts` com a Edge Function ativa versão 13. Comparação posterior confirmou correspondência exata; não houve redeploy da função.
- Edge Functions ativas: `import-ret-fontes` v13, `import-cad-convenios` v11 e `import-orcom-movements` v21. As cópias de Cad e ORCOM já coincidiam com as implantações.
- Projeto Supabase `qkjudfvlaatdcaosadun`: `ACTIVE_HEALTHY`; quatro migrações do recurso de seleção constam no histórico.
- Importações preservadas: 14/14 ORCOM em `success`, 449.304 linhas válidas, 28.000 linhas residuais de três imports `failed` antigos. Último workflow de importação `41524972727` terminou com sucesso; os 14 arquivos ORCOM foram registrados como `unchanged`, sem nova carga. RET_FONTES=1.153 linhas e CadConvenios=8.318 linhas na última versão válida.
- View de seleção: 1.237 ajustes elegíveis. Duas entradas antigas `processing` de CadConvenios, IDs `43ed7b0f-d3bc-4183-9c27-05c7fd05302d` e `2178bf01-1091-4d87-95d5-89019e053f04`, permanecem com zero linhas; não foram alteradas.
- Publicação Pages: run `41543819632` para o commit anterior terminou em sucesso. A atualização de fonte gerou o Pages run `41545785874`, que estava em fila no momento desta atualização; conferir seu desfecho.
- Sem mudanças no banco e sem importações disparadas nesta retomada. O commit de sincronização usou `[skip ci]` para evitar a execução do workflow importador.
- Pendente: testes funcionais autenticados em navegador (principalmente Safari/iPhone) para login, seleção, filtros, RET existente/ausente, limpar seleção, Overview, CSV, ficha e logout. Não considerar a interface funcionalmente aprovada apenas pela compilação/publicação.
- Alertas não tratados: funções `SECURITY DEFINER` ligadas ao Clareza, proteção de senhas vazadas desabilitada, cinco FKs sem índices e 23 índices sem uso observado. Avaliar isoladamente, sem mudança automática.

### Comando para retomar

```text
Continue o projeto Painel de Ajustes pelo repositório paineldeajustes/site-consulta-convenios. Leia CONTINUIDADE_CONSULTA_DE_AJUSTES.md e CHECKPOINT_CONSULTA_DE_AJUSTES.md. Confira o resultado do Pages run 41545785874, valide login e toda a navegação da Consulta de Ajustes em navegador autenticado, sem rodar importações concluídas. Preserve os dados success e não altere ORCOM nem o aplicativo Clareza sem análise específica.
```

Site: https://paineldeajustes.github.io/site-consulta-convenios/


## Fechamento da retomada — 02/11/2026

- HEAD atual de `main` nesta gravação: `a47bad8c7ddab033b01cf7f2abd57397abe673b1`.
- GitHub Pages run final `41545871962` para o commit `a47bad8...`: `completed / success`. O run intermediário `41545785874` ficou `cancelled`, substituído pela publicação mais nova bem-sucedida.
- Site acessível, mas aba inspecionada na tela de autenticação e sem sessão ativa. Testes internos pós-login permanecem pendentes; nenhuma credencial foi usada ou solicitada.
- Não houve importação, alteração de dados ou deploy de Edge Function nesta retomada.


## Paginação de 100 registros — 02/11/2026

**Implementado no front-end:**
- Empenhos: até 100 registros por página.
- Pagamentos: até 100 registros por página.
- Navegação: primeira, anterior, próxima e última página.
- Filtros voltam à primeira página.
- Totais anuais e gerais, resumo financeiro e conciliação permanecem calculados sobre o conjunto completo filtrado.
- CSV de pagamentos exporta todos os movimentos filtrados.
- Ficha PDF percorre todas as páginas para incluir todos os empenhos e pagamentos.
- Cache em memória durante a sessão, limitado aos 20 ajustes de movimentos usados mais recentemente (LRU); RET em cache por importação e chave do ajuste.
- Cache é invalidado no logout, na atualização manual e ao recarregar a página. Aba aberta mantém snapshot até recarga/manual refresh.

**Limitação conhecida:** paginação client-side. O conjunto completo do ajuste é transferido uma vez; somente 100 linhas são desenhadas por página. Isso reduz renderização do DOM e consultas repetidas ao revisitar ajustes cacheados, mas não reduz a primeira transferência desse ajuste. Paginação server-side permanece como evolução posterior.

**Preservação:** sem migração, alteração de banco, views, RLS, Edge Functions, importações ou registros ORCOM.

Commits funcionais: `53f116f0549a4a0d4ca37d91303f7bf3b171d80e`, `7776ba559a6baf5bbddd3c746bd67366911c15c4` e `7a7abb54e03e2fb1c94f291cfbcf9d3291e0cdf9`.

Validação estática: os dois blocos JavaScript inline compilam sem erro. GitHub Pages run `41549252538`: `completed / success`. Testes funcionais pós-login ainda pendentes.


## Aceleração da carga e snapshot de ajustes — 03/11/2026

**Implementado:**
- Login libera a interface e inicia o carregamento em segundo plano.
- Primeira carga da seleção traz somente 100 ajustes do snapshot já calculado; pesquisa/filtros e Visão Geral consultam o servidor.
- Consulta inicial da seleção medida em **19,172 ms** no banco (EXPLAIN ANALYZE), antes cerca de 5,6 s.
- Empenhos/pagamentos: 100 registros por chamada RPC, com filtros e totais globais calculados no servidor.
- Resumo por fonte e conciliação vêm do contexto agregado, sem transferência das linhas completas.
- CSV/PDF buscam todos os registros por páginas de forma explícita.
- Detalhe de documento é carregado diretamente, independente da página.
- Os campos pessoais listados foram removidos da view de consulta, da tela e do PDF. A varredura de 1.237 registros do snapshot não encontrou nenhuma dessas chaves; dados importados originais não foram alterados.

**Snapshot pré-calculado:**
- Tabela `public.orcom_adjustment_selection_snapshot` contém 1.237 ajustes.
- Atualização atômica pela função `refresh_orcom_adjustment_selection_snapshot()`.
- Refresh restrito a `service_role`; leitura com RLS para usuários ativos na allowlist, sem acesso `anon`.
- Edge Function `import-orcom-movements` está na versão **22** com ação interna para atualizar o snapshot.
- Workflow diário foi alterado para executar o refresh somente após todos os imports terminarem corretamente. Se qualquer import falhar, o snapshot anterior é preservado.
- Atualização manual também atualiza o snapshot só quando todos os imports dão certo.
- O snapshot foi inicialmente populado usando os registros existentes, sem nova importação.

**Validação técnica:**
- 100 ajustes por página; total 1.237.
- Para `000012022CG`: 565 empenhos e 1.470 pagamentos; páginas 1 e 2 retornam 100 em cada tabela.
- Os dois scripts inline do HTML compilam sem erro.
- Edge v22 ativa e fonte GitHub idêntica à implantação.
- Nenhuma importação de fonte foi disparada nesta etapa.
- Ainda falta teste funcional autenticado no navegador.
- GitHub Pages run `41553309778` para o commit `9380f813016b5864721be342c3556aade8e65680` estava em andamento na última consulta.

Migrações:
- `20261103001430_server_side_adjustment_pagination_and_privacy`
- `20261103001544_add_negative_balance_filter_to_selection_page`
- `20261103002646_precomputed_adjustment_selection_snapshot`

Site: https://paineldeajustes.github.io/site-consulta-convenios/


## Reforço final de privacidade — 03/11/2026

- A política RLS de `ret_fontes_rows` agora permite SELECT de usuários do painel apenas para importações `RET_FONTES.txt` com status `success`.
- Linhas originais de `CadConvenios.txt` foram mantidas, mas não ficam mais acessíveis diretamente pelo endpoint REST para usuários autenticados da allowlist.
- A função interna de atualização do snapshot mantém acesso para consolidar o cadastro; o teste pós-RLS concluiu com sucesso e retornou os 1.237 ajustes.
- Migração: `20261103003213_restrict_cadconvenios_raw_rows_to_internal_access`.

**Publicação:** o código funcional do site no commit `9380f813016b5864721be342c3556aade8e65680` teve Pages run `41553309778` concluído com sucesso. Ambos os scripts inline passaram na validação sintática. A sessão autenticada do navegador ainda precisa de teste funcional real.
