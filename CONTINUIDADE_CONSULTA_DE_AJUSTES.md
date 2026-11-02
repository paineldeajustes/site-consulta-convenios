# Continuidade — Painel de Ajustes

Última atualização: 2 de novembro de 2026 (horário de São Paulo).

## Identificação do projeto

- Repositório GitHub: https://github.com/paineldeajustes/site-consulta-convenios
- Branch de trabalho e publicação: \`main\`
- Site: https://paineldeajustes.github.io/site-consulta-convenios/
- Projeto Supabase: \`qkjudfvlaatdcaosadun\`
- URL Supabase: \`https://qkjudfvlaatdcaosadun.supabase.co\`
- Arquivo de entrada do site: \`index.html\`
- Funções de importação: \`.github/supabase-functions/\`
- Workflow: \`.github/workflows/import-ret-fontes-diario.yml\`

## Regra de checkpoint

A expressão exata **CHECKPOINT CONSULTA DE AJUSTES** é um comando do projeto. Quando o usuário a enviar, em qualquer momento, deve-se:

1. Consultar o estado real de \`main\`, o último deploy do Pages, as versões ativas das Edge Functions e as últimas importações no Supabase.
2. Atualizar este arquivo e \`CHECKPOINT_CONSULTA_DE_AJUSTES.md\` no GitHub com o estado atual, decisões, alterações, pendências e próximos passos.
3. Registrar os SHAs dos commits, as migrações aplicadas e os resultados dos testes. Nunca descrever como concluído algo que não foi verificado.
4. Entregar ao usuário o comando de retomada para um novo chat e o link do site.

Não presumir que o chat novo conhece o histórico. Ler estes dois arquivos antes de alterar o sistema.

## Comando para iniciar outro chat

Copiar e enviar:

\`\`\`text
Continue o projeto Painel de Ajustes pelo repositório paineldeajustes/site-consulta-convenios. Leia primeiro CONTINUIDADE_CONSULTA_DE_AJUSTES.md e CHECKPOINT_CONSULTA_DE_AJUSTES.md. Confirme o estado real do GitHub, do deploy, das Edge Functions e das importações no Supabase. Prossiga do checkpoint mais recente sem repetir cargas concluídas e sem sobrescrever importações válidas.
\`\`\`

## Arquitetura e fluxo de dados

### Fontes

- \`CadConvenios.txt\`: cadastro complementar; última importação bem-sucedida conferida com 8.318 registros. O objeto JSON tem \`join_key\`, \`year\`, \`number\`, \`letter\`, \`entity\` e \`extra_fields\`. A classificação \`AJUSTE2\` está em \`fields.extra_fields.AJUSTE2\`.
- \`RET_FONTES.txt\`: dados cadastrais/financeiros por fonte; última importação bem-sucedida conferida com 1.153 linhas e 51 chaves compactas de convênio. O arquivo tem formato de array JSON por linha; os campos relevantes são \`CONVENIO\` (posição 0), \`ENTIDADE\` (1), \`TPCAD\` (4), \`TPFOTE\` (5), \`VL-BEM\` (6), \`VL-CUSTEIO\` (7) e \`VL-REFORMA\` (8).
- ORCOM: arquivos de empenho e pagamento por exercício. As linhas são persistidas em \`public.orcom_movement_rows\`; o histórico de importação fica em \`public.orcom_file_imports\`.

### Importação ORCOM

Os arquivos são:
- Empenhos: \`TXT_EMPENHO-2020.txt\` até \`TXT_EMPENHO-2025.txt\`, mais \`TXT_EMPENHO.txt\` (2026).
- Pagamentos: \`TXT_PAGAMENTO-2020.txt\` até \`TXT_PAGAMENTO-2025.txt\`, mais \`TXT_PAGAMENTO.txt\` (2026).

A Edge Function \`import-orcom-movements\` usa importação retomável em blocos:
- leitura de 1.000 linhas por chamada;
- gravação em lotes de 250 linhas;
- progresso em \`expected_row_count\` e \`next_row_number\`;
- bloqueio temporário por arquivo em \`chunk_lock_until\`;
- retomada da sessão pelo \`import_id\` e \`drive_file_id\`;
- limpeza apenas do bloco incompleto em falha transitória;
- a versão válida anterior não é removida enquanto a nova importação não chega a \`success\`.

O workflow diário está configurado para 06:00 no horário de Brasília (cron 09:00 UTC) e timeout de até 120 minutos. O botão de atualização manual é restrito ao perfil administrador.

## Estado verificado em 02/11/2026

### Importações

Todos os 14 arquivos ORCOM, de 2020 a 2026, foram confirmados como \`success\`.

| Tipo | Exercício | Linhas efetivas |
|---|---:|---:|
| Empenho | 2020 | 17.550 |
| Empenho | 2021 | 17.512 |
| Empenho | 2022 | 21.882 |
| Empenho | 2023 | 19.812 |
| Empenho | 2024 | 20.148 |
| Empenho | 2025 | 16.186 |
| Empenho | 2026 | 12.372 |
| Pagamento | 2020 | 43.918 |
| Pagamento | 2021 | 44.301 |
| Pagamento | 2022 | 51.559 |
| Pagamento | 2023 | 51.559 |
| Pagamento | 2024 | 52.652 |
| Pagamento | 2025 | 44.763 |
| Pagamento | 2026 | 35.090 |

Os totais menores que a contagem esperada em alguns arquivos correspondem a uma linha vazia no TXT. A tabela física \`orcom_movement_rows\` tinha 477.304 linhas na última conferência; 28.000 dessas linhas pertencem a três tentativas antigas marcadas \`failed\` (12.000, 8.000 e 8.000). Elas não entram no resumo nem na consulta porque as visões e políticas exigem importação com status \`success\`. Não apagar sem revisar o histórico e confirmar a necessidade.

### Seleção de ajustes

A view \`public.orcom_adjustment_selection\`:
- seleciona apenas \`AJUSTE2 = CONCEDIDO\` em \`CadConvenios.txt\`;
- exige pelo menos um movimento de pagamento tipo O/R em exercício 2020 ou posterior;
- não limita o ano do ajuste a 2020: um ajuste antigo continua elegível se tiver pagamento O/R de 2020 em diante;
- resume todos os empenhos disponíveis e apenas pagamentos de 2020 em diante;
- expõe os metadados do cadastro e os totais para a lista geral.

Na última conferência havia 1.237 ajustes distintos elegíveis. O filtro de ano e o filtro de letra são filtros da seleção do ajuste, não uma alteração da regra de elegibilidade.

O \`RET_FONTES.txt\` mais recente contém somente 51 chaves compactas, todas correspondentes ao cadastro, concentradas em 2021. Por isso, o resumo de cadastro inicial/aditamentos é encontrado para 12 ajustes elegíveis nessa exportação; os demais ajustes não têm linha correspondente no RET mais recente. A tela deve informar ausência de linha RET, sem inventar valor cadastral.

Formato de chave:
- RET compacto: \`202100004SE\` (ano + número + sufixo).
- Cadastro/ORCOM: \`000042021SE\` (número + ano + sufixo).
- A conversão correta do RET para a chave de cadastro usa as posições 5–9, depois 1–4 e depois 10 em diante.

### Desempenho

A consulta à view antes da otimização levou aproximadamente 60,6 segundos. Após índices de cobertura e políticas RLS com \`(select auth.jwt())\`, o teste \`EXPLAIN ANALYZE\` levou aproximadamente 3,77 segundos para retornar os 1.237 ajustes.

O front-end foi alterado para:
- não baixar todas as linhas do RET ao entrar;
- carregar a view resumida dos ajustes elegíveis;
- carregar as linhas de RET apenas quando um ajuste é selecionado, usando a chave do convênio;
- carregar movimentos ORCOM do ajuste selecionado;
- manter filtros de colunas como listas suspensas.

## Regras funcionais atuais

1. A lista de seleção deve conter apenas ajustes com \`AJUSTE2 = CONCEDIDO\` e pagamento O/R de 2020 em diante.
2. A seleção tem filtros próprios por ano do ajuste e sufixo/letra.
3. Deve existir o botão **Limpar seleção** para zerar o ajuste/entidade selecionado sem remover os filtros de ano e letra.
4. Os filtros de colunas de empenho e pagamento devem ser listas suspensas.
5. Pagamentos anteriores a 2020 não são exibidos na ficha nem usados na elegibilidade; empenhos históricos continuam disponíveis.
6. A tela não pode carregar o RET inteiro na abertura; deve carregar apenas os dados do ajuste escolhido.
7. Não apagar importações \`success\` nem alterar o ORCOM legado. O processo de consulta deve permanecer somente leitura para os dados importados.

## Banco e segurança

- As tabelas de cadastro e movimentos usam RLS e acesso autenticado/allowlist.
- A view \`orcom_adjustment_selection\` usa \`security_invoker=true\`, tem SELECT para \`authenticated\` e não libera leitura para \`anon\`.
- As políticas RLS do painel foram ajustadas para avaliar \`auth.jwt()\` por subconsulta, reduzindo custo por linha.
- A Edge Function de movimentos está configurada para aceitar segredo interno do workflow ou sessão de usuário administrador.
- Nunca colocar \`SUPABASE_SERVICE_ROLE_KEY\`, \`IMPORT_FUNCTION_SECRET\` ou credenciais Google no HTML, em arquivos públicos ou em mensagens.

## Migrações e sincronização

As migrações do recurso de seleção e desempenho estão em \`supabase/migrations/\`, com os identificadores registrados no histórico Supabase:
- \`20261102213236_orcom_adjustment_selection_and_lazy_ret_loading\`
- \`20261102213716_fix_ret_convenio_key_order_in_selection\`
- \`20261102214341_selection_keep_historical_empenhos\`
- \`20261102214925_optimize_adjustment_selection_query_and_rls\`

A pasta de migrações deste repositório registra esta etapa do painel; o histórico anterior de outras funcionalidades do projeto/Supabase não está integralmente espelhado nela. Não executar \`supabase db reset\` como atalho. Antes de qualquer sincronização de schema, comparar \`supabase migration list\` e \`mcp__Supabase__list_migrations\`.

## Próximos testes recomendados

1. Entrar no site com a conta administradora e confirmar que a lista abre com ajustes concedidos e pagamento 2020+.
2. Testar filtros por ano do ajuste e por letra/sufixo; testar busca por número e por entidade.
3. Selecionar um ajuste de 2021 que exista no RET (ex.: \`00004/2021-SE\`) e confirmar linhas cadastrais e aditamentos.
4. Selecionar um ajuste de 2026 e confirmar que a tela mostra a ausência de lançamento no RET_FONTES mais recente, mas carrega empenhos e pagamentos ORCOM.
5. Testar **Limpar seleção** e confirmar que zera métricas e tabelas sem limpar filtros de ano/letra.
6. Testar todos os filtros suspensos de empenho e pagamentos.
7. Testar a tela Overview, o CSV e a ficha/relatório.
8. Confirmar o tempo percebido de login, seleção e abertura de um ajuste. O tempo medido da view no banco ficou em ~3,77s, mas o tempo real do navegador ainda precisa ser validado com login autenticado.

## Último commit de interface antes deste checkpoint

\`ab32f016113c74077fe17ca266fb30e1e68b9ca0\` (a publicação deste commit deve ser confirmada no GitHub Actions após a atualização dos arquivos de continuidade).


## Correção do login, inicialização e logout — 02/11/2026

O teste real no Safari do iPhone mostrou a mensagem `Cannot access 'retFontesImportId' before initialization` após a autenticação. O usuário institucional conseguia autenticar, mas a carga da consulta falhava; como o listener de logout só era instalado no fim do script, a falha anterior também impedia o botão **Sair da conta** de funcionar.

Correções gravadas em `index.html`:
- Estados globais da consulta declarados antes das rotinas de autenticação e carga, eliminando a zona temporal de inicialização de `retFontesImportId` e das demais variáveis de estado.
- Listener de logout instalado junto aos controles de autenticação, antes de qualquer carga de dados. Usa `signOut({scope:'local'})` e sempre limpa a interface local no bloco `finally`, mesmo quando houver erro na chamada de saída.
- Restaurada como constante global a estrutura de 26 colunas `RET_SCHEMA`, que era definida somente dentro do parser antigo, mas passou a ser utilizada pela leitura sob demanda.
- O botão Mostrar/Ocultar senha passou a ter listener independente; listeners de login e recuperação também foram antecipados.

Commits:
- `63aa410f1d0fbc8ba2850f95296cc839f66e38fa` — isolamento do botão de senha e antecipação dos handlers de autenticação.
- `6950af805bac1f2d0100e412e931b32615c2dce0` — correção da ordem dos estados e listener de logout antecipado.
- `f6fbe35c5d135b1773a5782be4f025f47edbf887` — restauração do esquema global de 26 colunas.

GitHub Actions Pages run `41543569107`: `completed / success`, em 02/11/2026 às 23:13 UTC. O JavaScript inline passou na verificação de sintaxe. **Ainda é necessário testar o fluxo completo no Safari/iPhone**; a publicação concluída não substitui o teste real de login, carregamento dos ajustes e saída da conta.
