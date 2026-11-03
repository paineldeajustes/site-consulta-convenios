# Migrações do Painel de Ajustes

Esta pasta registra as migrações aplicadas no Supabase nesta etapa de seleção e otimização do Painel de Ajustes.

O histórico anterior do projeto (incluindo outras funcionalidades e etapas iniciais das tabelas ORCOM) não estava integralmente espelhado no GitHub quando esta pasta foi criada. Portanto, estes arquivos não representam, isoladamente, um baseline completo para recriar o projeto do zero.

Antes de usar Supabase CLI para sincronizar, comparar as versões locais com \`mcp__Supabase__list_migrations\`. Não executar \`supabase db reset\` para tentar reconstruir o ambiente sem recuperar primeiro todas as migrações anteriores.

- `20261103002646_precomputed_adjustment_selection_snapshot.sql`: materializa os 1.237 ajustes já agregados; a rotina diária troca o snapshot apenas após todas as importações concluírem com sucesso. A função de atualização fica restrita a `service_role`, e a leitura do snapshot mantém RLS para usuários ativos na allowlist.

- `20261103003213_restrict_cadconvenios_raw_rows_to_internal_access.sql`: restringe o SELECT direto de usuários do painel à importação `RET_FONTES.txt`. As linhas brutas de `CadConvenios.txt` continuam preservadas e são consultadas pela função interna de snapshot, não expostas via PostgREST aos usuários autenticados.
