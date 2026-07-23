## Diagnóstico confirmado

O preview ainda pode estar preso em versão antiga porque o projeto continua com `vite-plugin-pwa` ativo em produção. Isso gera novamente um Service Worker de app-shell no build publicado, enquanto `src/main.tsx` tenta desregistrar caches tarde demais, depois que o HTML/JS antigo já pode ter sido servido pelo SW anterior.

Também existem `public/sw.js` e `public/service-worker.js` como kill-switch, mas o plugin PWA pode sobrescrever/concorrer com `/sw.js` em produção. Isso torna a correção instável para preview e deploys futuros.

## Plano seguro

1. **Remover o PWA com cache de app-shell**
   - Tirar `VitePWA` do `vite.config.ts`.
   - Remover a geração automática de Service Worker no build.
   - Manter o app sem cache offline, para o preview sempre carregar a versão atual.

2. **Manter apenas installabilidade sem cache**
   - Criar/usar um `manifest.webmanifest` estático em `public/` com nome, ícones, cores e `display: standalone`.
   - Isso preserva “Adicionar à tela inicial”, mas sem Service Worker e sem cache de versão antiga.

3. **Manter kill-switch por uma versão**
   - Deixar `public/sw.js` e `public/service-worker.js` como workers de limpeza por enquanto, para navegadores que ainda tenham SW antigo registrado conseguirem trocar para um worker que limpa e se desregistra.
   - Ajustar o kill-switch para não forçar `client.navigate()`, evitando loops/tela branca.

4. **Aprimorar a limpeza no carregamento**
   - Ajustar `src/main.tsx` para:
     - desregistrar SWs existentes;
     - limpar caches relacionados ao app;
     - se a página ainda estiver controlada por SW antigo, fazer no máximo um reload controlado usando `sessionStorage`, evitando loop infinito.

5. **Validar no preview**
   - Verificar via Playwright/local preview que:
     - a tela não fica branca;
     - `/kanban-central` renderiza;
     - não há registro ativo de Service Worker após o carregamento;
     - caches antigos foram removidos.

## Resultado esperado

Depois da implementação, o preview deve parar de servir builds antigos. Se o navegador do usuário ainda estiver controlado por um SW legado naquele momento, uma recarga forte única pode ser necessária, mas o app não continuará criando novos Service Workers que prendam versões futuras.