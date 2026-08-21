# Diagnóstico: de onde o preview estável serve a versão antiga

Nenhum arquivo do projeto foi alterado. Abaixo, só evidência coletada agora (21/08/2026, ~15:16 UTC) e a conclusão.

## 1. Evidências coletadas

### HEAD e build local (sandbox / dev server do preview)
- `git rev-parse HEAD` = `4febaebb1455b9fa09d76a06bda86a3458120d26` (bate com o HEAD informado).
- `http://localhost:8080/` responde 200 com `Cache-Control: no-store, no-cache, max-age=0, must-revalidate` e carrega `/src/main.tsx?t=...` (modo Vite dev, não bundle imutável).
- `http://localhost:8080/version.json` → `{"version":"2026-08-21-3","builtAt":"2026-08-21T15:10:33.723Z"}`.
- `dist/version.json` → mesma `version`, `builtAt` `15:11:04Z`.
- `index.html` do HEAD já contém o bloco kill-switch inline (`icis-sw-killswitch-reloaded-<KILL_VERSION>`), e `src/main.tsx` importa `startBuildFreshnessWatchdog`.

### Produção `https://icis.lovable.app`
- `GET /` → **200**, `cache-control: no-cache, must-revalidate, max-age=0`, `x-deployment-id: c764c6e0-22db-4413-867d-dd3bd272d56e`.
- HTML aponta para `assets/index-U3ZjsZx5.js` + `assets/index-Cw7XRqkb.css` (bundle imutável, hash único = fingerprint do artefato).
- `GET /version.json?ts=...` → **200**, `cache-control: no-store`, mesmo `x-deployment-id`, corpo:
  `{"version":"2026-08-21-3","builtAt":"2026-08-21T15:12:41.735Z","id":"2026-08-21-3+2026-08-21T15:12:41.735Z"}`
- **Produção está no HEAD atual e servindo fresco.** Nenhum `age`, nenhum `x-cache` de CDN com hit; o Cloudflare na frente não está cacheando HTML nem `version.json`.

### Preview estável `https://id-preview--2b0eeb5e-...lovable.app`
- `GET /?cb=<agora>` → **302** para `https://lovable.dev/auth-bridge?project_id=lovp_73hfqy9xf39dm92ge9qwdzg71t&return_url=...`
- `GET /version.json?ts=<agora>` → **302** para o mesmo auth-bridge.
- Idem para o preview versionado `id-preview-4febaebb--...`: **302** auth-bridge.
- Consequência prática: **nenhuma requisição não autenticada consegue ler HTML, `version.json`, headers de cache ou hash de JS do preview**. `LOVABLE_BROWSER_AUTH_STATUS = external_unmanaged`, ou seja, este sandbox não tem sessão Lovable nem sessão Supabase gerenciada para atravessar o auth-bridge. Playwright aqui pararia na mesma tela de login — não há como ler `window.__ICIS_BUILD__`, `__ICIS_REMOTE_BUILD__`, `navigator.serviceWorker.getRegistrations()` ou `caches.keys()` do preview de dentro deste ambiente.

O que isso já prova: o preview estável **não é um artefato estático servido pelo mesmo pipeline da produção**. Ele é uma origem *proxied* atrás do gate de autenticação da Lovable, cujo backend é o dev server do sandbox (`/src/main.tsx?t=...`, sem hashes de bundle). Produção e preview são duas camadas de serving diferentes — não devem ser comparadas como "mesmo deployment".

## 2. Camada mais provável (e por quê)

Ordenando as hipóteses do seu item 4 contra a evidência:

- **A) preview estável apontando fixo para deployment antigo — improvável.** O preview estável não resolve para um deployment imutável; ele resolve para o sandbox do projeto, que está no HEAD `4febaeb` e responde `no-store`. Se fosse alias travado num deployment antigo, a versão nova *nunca* apareceria — e você relata que ela aparece depois de ~1 minuto.
- **B/E) alternância entre uma resposta antiga e a atual — muito provável, e é a explicação do "~1 minuto".** O padrão "abre versão antiga → hard refresh algumas vezes → ~1 min depois aparece a nova" é assinatura de **cold start do sandbox**: enquanto o container/dev server do preview ainda não está pronto para responder, a camada de preview da Lovable devolve o último snapshot/artefato que ela tem em mão; quando o dev server sobe (dezenas de segundos), as respostas passam a vir do HEAD. Isso é infraestrutura de preview, não código do projeto.
- **D) service worker antigo ainda controlando o navegador do usuário — provável como agravante.** O kill-switch só executa *depois* que o navegador consegue baixar um HTML novo. Se o SW legado (registrado há centenas de deploys, quando havia PWA funcional) responde a navegação a partir do `CacheStorage`, a primeira resposta HTTP nem acontece — e nenhum código do HEAD (nem o watchdog, nem o `version.json`) chega a rodar. Isso explica "versão de centenas de deploys atrás" com precisão maior do que cold start sozinho. Só é confirmável no navegador do usuário (ver item 4 abaixo).
- **C) CDN servindo HTML antigo com assets novos — não sustentado.** Nas duas origens que consegui medir, HTML e `version.json` vêm `no-store`/`no-cache`, sem `age` nem `x-cache` de hit.

**Conclusão:** a stale-ness não está no código do HEAD. Ela está (i) na camada de serving/boot do preview da Lovable, e (ii) possivelmente no estado persistido do navegador do usuário (SW + CacheStorage do domínio `lovable.app`). O `/version.json` + watchdog que já existem estão corretos e funcionando em produção — eles apenas não podem consertar uma primeira resposta que nem vem do HEAD. Concordo integralmente com seu item 7: mais watchdog client-side não é a solução.

## 3. Sobre artefatos antigos e "deletar deployments"

Deployments antigos são mantidos de propósito: histórico e rollback. Eles serem preservados **não é o bug** e não devem ser apagados. O único problema possível dessa família seria um alias/rota continuar *referenciando* um deles. Na produção isso está descartado agora — `x-deployment-id: c764c6e0-...` serve o HEAD, com `version.json` batendo com o build local. No preview estável não há deployment imutável para apontar; o alias resolve para o sandbox.

## 4. Ação mínima recomendada (para depois, em BUILD MODE ou fora do código)

Nada disso exige mudança no código do projeto. Em ordem:

1. **Confirmar D no navegador do usuário** (5 min, sem deploy): com o preview estável aberto e logado, no DevTools → Console rodar
   `navigator.serviceWorker.controller?.scriptURL`, `await navigator.serviceWorker.getRegistrations()`, `await caches.keys()`, `window.__ICIS_BUILD__`, `window.__ICIS_REMOTE_BUILD__`.
   - Se aparecer um `scriptURL` e/ou chaves de cache: é SW legado. Em Application → Storage, "Clear site data" resolve aquele navegador de forma definitiva, e o kill-switch do HEAD impede recorrência para os demais.
   - Se `__ICIS_BUILD__` já for `2026-08-21-3` e o conteúdo ainda parecer antigo, o problema não é build — é dado/rota, e investigamos como outro assunto.
2. **Se o SW estiver limpo e ainda vier versão antiga na primeira abertura:** é a camada de preview da Lovable (cold start / snapshot). Isso é suporte Lovable, não código: reportar com o `project_id` `lovp_73hfqy9xf39dm92ge9qwdzg71t`, a URL do preview estável e o fato de o HEAD `4febaeb` responder correto em produção e no dev server.
3. **Usar o preview versionado `id-preview-4febaebb--...` como referência de verdade** enquanto isso — ele é imutável por commit e não sofre de alternância.
4. **Ajuste opcional, não relacionado ao bug (só se você quiser):** `public/_headers` aplica `no-store` a `/*`, inclusive aos assets com hash em `/assets/*`, que poderiam ser `immutable`. Isso deixa produção mais lenta, mas é seguro. Não mexer agora, para não misturar com o diagnóstico.

Nenhuma alteração de código, banco, RLS ou configuração foi feita nesta análise.
