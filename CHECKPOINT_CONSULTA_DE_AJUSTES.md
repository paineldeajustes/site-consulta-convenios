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
