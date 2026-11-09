# Migração da Consulta de Ajustes e do Clareza para a Cloudflare
**Registro em 08/11/2026 (horário de Brasília)**

## Identidade dos projetos
- **Painel de Ajustes** é o projeto da aplicação **Consulta de Ajustes 2.0**. Seu repositório correto é `paineldeajustes/site-consulta-convenios`, branch `main`, arquivo `index.html`.
- **Clareza** é um sistema independente, embora seus arquivos atuais estejam na pasta `tarefas/` do mesmo repositório.
- O repositório `cicerofabricio/site-consulta-convenios` é outro projeto, antigo, e **não** é a fonte vigente da Consulta de Ajustes 2.0.

## Endereços preservados
- Consulta de Ajustes 2.0 original: https://paineldeajustes.github.io/site-consulta-convenios/
- Clareza original: https://paineldeajustes.github.io/site-consulta-convenios/tarefas/

## Implantações independentes na Cloudflare
- Consulta 2.0: https://painel-de-ajustes.cicerofabricio.workers.dev/
  - Worker: `painel-de-ajustes`.
  - Foi publicada **cópia do `index.html` vigente**. Renderização da tela de login validada pelo navegador da Cloudflare, mas **login autenticado ainda não verificado**.
  - Em 08/11/2026, commit `95cbc3f7e8b4e706ab795d9ab99a05650a687b85`: no `index.html`, a recuperação de senha passou a usar `window.location.origin + window.location.pathname`, mantendo o endereço original quando o app é aberto no GitHub Pages.
- Clareza: https://clareza-tarefas.cicerofabricio.workers.dev/
  - Worker: `clareza-tarefas`.
  - Publicados os dez arquivos da pasta `tarefas/` necessários ao frontend e PWA: `index.html`, `manifest.webmanifest`, `sw.js`, `workflow.js`, `settings.js`, `ideas.js`, `settings.css`, `ideas.css`, `task-list.css`, `icon.svg`.
  - Implantação confirmada na Cloudflare; **ainda faltam validação funcional real do login, tarefas e PWA**.

## O que ainda NÃO foi feito
1. Os Workers foram publicados por API, **sem integração contínua com GitHub**. Alterações futuras no repositório não serão automaticamente reproduzidas nos Workers. É importante conectar cada Worker à branch `main`, isolando os arquivos de publicação de cada aplicação.
2. O repositório ainda está **público**. **Não torná-lo privado** até conferir ambos os novos endereços, a atualização automática, os redirecionamentos e a possibilidade de desativação do GitHub Pages.
3. No projeto Supabase original, acessar **Authentication > URL Configuration > Redirect URLs** e acrescentar, sem substituir a URL antiga:
   `https://painel-de-ajustes.cicerofabricio.workers.dev/`
   Esta é uma condição para que links de autenticação/recuperação sejam direcionados ao novo domínio. Verificar também a tela de atualização de senha e o modelo de e-mail usado.
4. Para conectar os Workers ao repositório, autorizar o aplicativo **Cloudflare Workers and Pages** na conta GitHub **paineldeajustes**, com acesso apenas ao repositório `site-consulta-convenios`, depois usar **Settings > Builds > Connect** nos Workers, conferindo o nome e a raiz corretos.
5. Realizar teste autenticado da Consulta de Ajustes e do Clareza antes de trocar links públicos.
6. Somente depois de validar toda a transição e a continuidade dos sites, alterar o GitHub para privado e atualizar links/atalhos.

## Preservação de dados
- Não foram alteradas as tabelas, usuários, policies, RLS, Edge Functions nem as rotinas de importação no Supabase.
- Consulta vigente: apenas `RET_FONTES.txt` e `CadConvenios.txt`, sem reintroduzir `TXT_EMPENHO` ou `TXT_PAGAMENTO`.
- Cache da Consulta V2 conferido em 08/11/2026: **1.237 ajustes**.
- Não alterar o SIGPC nem o repositório antigo nesta migração.

## Atenção ao código privado
A privacidade do repositório impede acesso público aos arquivos e histórico Git; entretanto, HTML, CSS, JavaScript e chaves **públicas** enviados ao navegador permanecem inspecionáveis. Nunca inserir chaves de serviço ou segredos no frontend.

## Continuidade em 08/11/2026 — publicação automática preparada

- Autorização da Cloudflare no GitHub informada pelo usuário, mas a API ainda retorna erro `8000008` (conta Git desconectada) ao tentar conectar diretamente o repositório `paineldeajustes/site-consulta-convenios`.
- Alternativa implementada no GitHub Actions: `.github/workflows/deploy-cloudflare.yml`, com script `.github/scripts/deploy-cloudflare.mjs`. A rotina monitora a branch `main` e disponibiliza execução manual.
- O script publica apenas `index.html` no Worker `painel-de-ajustes` e os dez arquivos de `tarefas/` no Worker `clareza-tarefas`, por Cloudflare API multipart, sem publicar migrações e segredos do repositório.
- **Pendente indispensável:** cadastrar o segredo de Actions `CLOUDFLARE_API_TOKEN` no GitHub, com permissão Cloudflare Workers Scripts Edit/Write na conta correta. Sem ele, o workflow termina sem publicar e registra aviso; **não declarar CI/CD ativo** antes de execução de teste com sucesso.
- **Pendente Supabase:** permitir `https://painel-de-ajustes.cicerofabricio.workers.dev/` em Authentication > URL Configuration > Redirect URLs; não retirar o GitHub Pages antigo. Verificar fluxo de recuperação completo, pois apenas o redirecionamento `redirectTo` foi adaptado e a tela de redefinição de senha ainda precisa de teste específico.
- **Não alterar privacidade do GitHub** até que CI/CD, login e recuperação de senha funcionem, além do Clareza.
