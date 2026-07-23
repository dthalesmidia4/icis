## Diagnóstico

O preview antigo vem de um **Service Worker legado** ainda ativo no navegador. Quando o SW controla a página, ele serve o `index.html` e os bundles do cache — o novo `main.tsx` (que desregistra SW e limpa caches) nunca chega a rodar, então o kill-switch atual não se aplica sozinho.

Já existem stubs kill-switch em `public/sw.js` e `public/service-worker.js`, mas eles só são executados se o navegador for buscar aquele arquivo. Sem "gatilho", o navegador só reavalia o SW após ~24h.

## Plano

1. **Forçar a atualização do SW pelo servidor**
   - No `index.html`, adicionar um `<script>` inline no `<head>` (roda antes de qualquer JS bundle) que:
     - Chama `navigator.serviceWorker.getRegistrations()` e, para cada registro, executa `registration.update()` — isso faz o browser refazer download do arquivo do SW, ignorando cache HTTP, e assim o kill-switch entra em `install`/`activate` mesmo com bundle antigo carregado.
     - Após `update()`, chama `unregister()` em cada registro.
     - Limpa `caches.keys()` → `caches.delete()`.
     - Se `navigator.serviceWorker.controller` existia, faz um único `location.reload()` guardado em `sessionStorage` para servir o HTML fresco.
   - Como esse script está **inline no HTML** (não em um bundle), ele executa sempre que o `index.html` for entregue — inclusive quando o SW antigo servir o HTML cacheado, pois o HTML antigo já foi publicado com esse script depois do fix anterior (usuário viu versões novas antes; agora regrediu, indicando novo SW parasita ou cache HTML). Reforçamos para garantir.

2. **Headers anti-cache no HTML e nos SW files**
   - Adicionar `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` e `Pragma: no-cache` no `<head>` do `index.html` para reduzir cache do próprio HTML pelo browser/CDN.
   - Manter `public/sw.js` e `public/service-worker.js` como kill-switch (já estão).

3. **Remover o link do manifest se não usado como PWA**
   - Verificar `manifest.webmanifest`; manter porque afeta instalação PWA (não é a causa aqui). Sem mudança.

4. **Instrução ao usuário como fallback imediato**
   - Se após deploy o preview ainda vier antigo em 1 sessão: DevTools → Application → Service Workers → "Unregister" + Storage → "Clear site data", ou abrir o preview em aba anônima uma vez. Isso destrava manualmente enquanto o SW antigo persistir.

## Arquivos alterados

- `index.html` — script inline de limpeza no `<head>` + metas anti-cache.
- (Sem novas dependências, sem mudanças em `main.tsx` — o cleanup do `main.tsx` fica como segunda camada.)

## Validação

- Após deploy, abrir o preview em aba nova. Console deve mostrar 0 service workers ativos em `chrome://serviceworker-internals` para o domínio.
- Recarregar 2x — a versão deve corresponder ao último deploy.
- Se ainda persistir em uma sessão específica, aplicar o fallback manual acima uma vez.