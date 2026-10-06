# Diagnóstico: site publicado "não carrega" (sem alterações)

## O que foi aferido (06/10/2026, ~19:10 UTC)

| Verificação | Resultado |
|---|---|
| https://icis.lovable.app responde | 200, HTML em 0,23s |
| Publicação atualizada | /version.json = build de hoje 14:03 UTC (não está presa) |
| Visibilidade | Publicado, público |
| Assets JS/CSS | index-BKrudpke.js 200, `text/javascript`; todos os 6 assets 200, sem 404/5xx/MIME errado |
| Navegador limpo (Playwright) | App monta, redireciona para /auth e renderiza a tela de login. Nenhum `pageerror` |
| Variáveis Supabase em produção | Bundle inicializa o cliente (logs `[Auth] Initial session check`), URL/key corretas |
| Service worker / cache | Sem SW registrado em navegador limpo; kill-switch presente. Um reload extra na primeira carga (esperado pelo script de takeover) |
| Supabase REST | Responde em ~0,05s |
| **Supabase Auth** | **Instável: 1ª rodada timeout de 20s em `/auth/v1/health` e `/auth/v1/settings` (e um 504 antes); depois 200 com 7–14s de latência** |

## Conclusão

Produção NÃO está quebrada no nível de deploy/bundle/roteamento: para um visitante sem sessão, o site carrega.

Causa mais provável (com evidência objetiva): **o serviço de Auth do Supabase externo (neriayolipcupycirwhf) está lento/intermitente (504 e timeouts)**. Usuários já logados dependem dele para renovar o token ao abrir o app; com Auth travando, o app fica preso na tela de carregamento (sessão/agência nunca resolvem), parecendo "site não carrega". O editor pode parecer normal por usar sessão já válida e brokerada.

## Hipóteses ordenadas

1. Auth Supabase degradado (evidência: 504/timeouts medidos agora; REST sadio). Pode ser projeto sobrecarregado, limite de plano/compute ou incidente.
2. Navegador do usuário com SW/cache antigo de build anterior a 21/08 (não reproduzível em navegador limpo; só afetaria dispositivos específicos).
3. Bug pós-login (tenant/agência) — não testável sem conta; nenhum erro na fase anônima.

Alteração recente de código como causa: improvável — o bundle de hoje carrega sem exceções.

## Próximos testes mínimos para fechar

1. No painel Supabase: Reports/Auth logs e status de compute/uso (CPU, conexões, plano) nos últimos dias.
2. Em uma aba anônima, logar em icis.lovable.app e verificar se trava após "Entrar" (confirma hipótese 1 vs 2).
3. No aparelho que falha: DevTools > Application > Service Workers/Clear site data (só confirma hipótese 2).
4. Opcional: eu repetir as medições de latência do Auth em outro horário.

Nenhuma correção feita.
