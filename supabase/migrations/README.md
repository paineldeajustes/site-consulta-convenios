# Migrações do Painel de Ajustes

Esta pasta registra as migrações aplicadas no Supabase nesta etapa de seleção e otimização do Painel de Ajustes.

O histórico anterior do projeto (incluindo outras funcionalidades e etapas iniciais das tabelas ORCOM) não estava integralmente espelhado no GitHub quando esta pasta foi criada. Portanto, estes arquivos não representam, isoladamente, um baseline completo para recriar o projeto do zero.

Antes de usar Supabase CLI para sincronizar, comparar as versões locais com \`mcp__Supabase__list_migrations\`. Não executar \`supabase db reset\` para tentar reconstruir o ambiente sem recuperar primeiro todas as migrações anteriores.

- `20261103002646_precomputed_adjustment_selection_snapshot.sql`: materializa os 1.237 ajustes já agregados; a rotina diária troca o snapshot apenas após todas as importações concluírem com sucesso. A função de atualização fica restrita a `service_role`, e a leitura do snapshot mantém RLS para usuários ativos na allowlist.

- `20261103003213_restrict_cadconvenios_raw_rows_to_internal_access.sql`: restringe o SELECT direto de usuários do painel à importação `RET_FONTES.txt`. As linhas brutas de `CadConvenios.txt` continuam preservadas e são consultadas pela função interna de snapshot, não expostas via PostgREST aos usuários autenticados.

- `20261103011647_adjustment_catalog_and_test_data_cleanup.sql`: cria a estrutura inicial do catálogo e limpa as linhas físicas antigas de RET_FONTES/CadConvenios e linhas ORCOM failed/superseded, preservando as tabelas de histórico.
- `20261103011829_normalize_catalog_to_adjustment_numbers_only.sql`: reduz o catálogo à única coluna `adjustment_number`, aplica RLS para usuários ativos da allowlist e cria a consulta de metadados por número selecionado.
- `20261103012322_fix_number_only_catalog_rpc.sql`: a RPC de listagem devolve somente números, sem chave interna, entidade, CPF, contato ou movimentos.
- `20261103012703_fix_snapshot_refresh_safe_delete_predicates.sql`: reconstrói snapshot e catálogo na mesma transação usando predicados explícitos de DELETE exigidos por pg_safeupdate. A função fica restrita a `service_role`.

- `20261103013223_increase_snapshot_refresh_statement_timeout.sql`: aumenta o limite da rotina interna de atualização do snapshot para 120 segundos, mantendo a reconstrução atômica e a execução restrita a `service_role`.
