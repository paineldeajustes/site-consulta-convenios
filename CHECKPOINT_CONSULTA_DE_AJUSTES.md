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
