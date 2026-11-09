# Centralização — checkpoint de preparação
Data: 08/11/2026, horário de Brasília.

## Objetivo confirmado
GitHub definitivo: `cicerofabricio`. Separar Consulta de Ajustes 2.0 e Clareza, preservar histórico e sistemas em funcionamento. Nenhuma exclusão, mudança de visibilidade ou transferência de propriedade foi realizada nesta etapa.

## Fonte e publicação
- Consulta e Clareza: este repositório, referência auditada `275a27f2387ed4d58f71769bfce1c65e409ac8fb`.
- Consulta Cloudflare: https://painel-de-ajustes.cicerofabricio.workers.dev/
- Clareza Cloudflare: https://clareza-tarefas.cicerofabricio.workers.dev/
- As URLs originais do GitHub Pages permanecem necessárias durante a transição.
- `cicerofabricio/site-consulta-convenios` é outra aplicação: consulta antiga e páginas de emendas, fundo a fundo e Brasil na Vida Real. Não substituir seu conteúdo pela Consulta 2.0.

## Evidências desta etapa
- HTTP 200 no HTML da Consulta e nos dez arquivos de `tarefas/` publicados no Worker; conteúdo comparado byte a byte com esta referência Git.
- Telas de acesso da Consulta e do Clareza abertas em navegador.
- GitHub Actions run `42543309888`: os jobs concluíram como sucesso, porém os passos de publicação do painel e do Clareza foram `skipped`. Não há comprovação de CI/CD ativo.
- Cloudflare: nenhum build trigger configurado nos Workers da Consulta e do Clareza.
- Rotina de importação `42467806856`: RET_FONTES e CadConvenios executados com sucesso em 08/11/2026. Preservar essa rotina e suas credenciais; não reintroduzir TXT_EMPENHO/TXT_PAGAMENTO.
- Preparada em cópia local isolada a extração de `tarefas/`: 143 commits relevantes. Árvore original da pasta e árvore extraída idênticas: `49406dd1a0031cc299e9575bba3ecc8fd860dce8`. Head extraído: `8e641858b572725fd2d638d8390a579b846ec206`.
- Backup Git completo da origem e do histórico extraído: integridade e restauração local verificadas. Esses arquivos temporários não substituem a preparação de cópias duráveis antes de uma transferência de produção.

## Destinos planejados, ainda não criados nesta etapa
| Sistema | Destino |
|---|---|
| Consulta de Ajustes | `cicerofabricio/consulta-de-ajustes` |
| Clareza | `cicerofabricio/clareza` |
| SIGPC | `cicerofabricio/sigpc` |
| Manuais | `cicerofabricio/manuais`, já existente |
| Suplementação | `cicerofabricio/suplementacao-orcamentaria` |

Os bancos atuais e os nomes dos serviços Cloudflare devem ser preservados. O reposicionamento Git não exige recriar os bancos.

## Mudança proposta neste PR
Se o fallback Actions não possuir `CLOUDFLARE_API_TOKEN`, o job deve falhar claramente. Antes, o workflow emitia apenas aviso e terminava como sucesso sem publicar. A alteração não cria token, não ativa o fallback, não configura a integração nativa e não publica site.

Validação local: credencial vazia retorna código 1; valor fictício não vazio retorna 0 no passo de verificação. Nenhuma chamada de publicação foi feita no teste.

## Próxima etapa
1. Inspecionar a instalação real **Cloudflare Workers and Pages** e sua associação à conta Cloudflare. As instalações listadas pelo conector do ChatGPT não são prova da instalação do aplicativo Cloudflare.
2. Criar os destinos sob `cicerofabricio` e importar o histórico preparado, mantendo fontes e sites antigos operacionais. Não transferir/renomear a origem antes de verificar o impacto sobre os links do GitHub Pages.
3. Configurar e testar integração nativa para cada Worker existente, sem criar Workers duplicados. Executar mudança de teste, conferir commit publicado e ensaiar retorno.
4. Conferir Redirect URLs do Supabase para os dois domínios novos, preservando URLs antigas. A configuração administrativa não foi lida nem modificada nesta etapa.
5. Consulta: o código atual envia o e-mail de recuperação, mas não implementa formulário de nova senha nem o tratamento `PASSWORD_RECOVERY`/`updateUser`. Corrigir e testar antes do corte.
6. Clareza: preservar formulário de recuperação existente; testar login real, tarefas, sincronização, instalação no iPhone e novas inscrições push antes de mudar os atalhos.
7. Manuais: a aplicação e os dados de demonstração em `main` são idênticos nas duas contas; preservar a branch legada `feat/supabase-manuais` e as diferenças de documentação/publicação.
8. SIGPC: preservar domínio, Pages e banco; Suplementação: preservar Worker, D1 e histórico de `feature/suple-mvp`. Não fazer merge dessa branch na main do SIGPC.

Transferências de produção, mudanças de visibilidade e exclusões dependem de análise concreta e autorização específica do usuário. Não inserir tokens ou senhas neste documento.
