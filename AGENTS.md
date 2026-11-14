# AGENTS.md — Ovo Frito

Cliente HTTP local-first em Electron. Sem bundler, sem framework: scripts clássicos.

## Comandos

- `npm start` — abre o app Electron
- `npm run web` — servidor fallback em `http://127.0.0.1:3456` (PORT env para mudar)
- `npm test` — unit + integration + `tests/*.test.js`
- `npm run test:unit` / `npm run test:integration` — suítes separadas
- `npm run test:e2e` — Playwright/Electron (`test/e2e/`)

## Estrutura

- `main.js` — entry Electron: bootstrap + lifecycle apenas
- `main/bootstrap.js` — composition root (`createAppContext`), compartilhado com `server-fallback.js`
- `main/ipc/` — handlers IPC por domínio; `channels.js` é a fonte única de canais
- `main/window.js` — criação da BrowserWindow e guards de navegação
- `main/services/` — mock-server, load-runner, folder-sync, proxy-interceptor, sync-dirs, ServiceManager
- `preload.js` — bridge `window.pm.sdk.IPC` com allowlists (paridade testada em `test/unit/ipc-channels.test.js`)
- `renderer/lib/` — utilitários puros UMD (`window.CDO.<ns>` + `module.exports`)
- `renderer/core/` — núcleo do app extraído de `app.js` (estado, env, tabs, importer/exporter, executor, editor, response, sidebar, runner, modals, layout); expõe `window.CDO.core.*`, `window.CDO.importer` e `window.CDO.exporter`
- `renderer/features/` — módulos de UI que consomem `window.CDO.app` e `window.CDO.<ns>`
- `server-fallback.js` — modo web; dispatch IPC via `main/ipc/http-bridge.js`

## Regras

1. **Ordem de scripts em `renderer/index.html` é load-bearing.** `core/state.js` primeiro, `core/layout.js` (init) por último, `features/*` depois do core.
2. Scripts clássicos compartilham escopo global: `const`/`function` top-level são visíveis entre arquivos. Não usar ES modules — `file://` no Electron bloqueia por CORS.
3. `renderer/lib/*` segue o padrão UMD de `renderer/lib/interpolate.js`: IIFE + `root.CDO.<ns>` + fallback `module.exports`. `renderer/core/*` usa scripts clássicos com escopo global e footer que expõe `module.exports`/`window.CDO.core.*`, `window.CDO.importer` e `window.CDO.exporter`.
4. Features não devem depender de globais implícitos: usar `window.CDO.app.*` ou `window.CDO.<ns>.*`.
5. Canais IPC novos: adicionar em `main/ipc/channels.js`, criar handler em `main/ipc/<domínio>.js`, e atualizar `preload.js` (teste de paridade falha se esquecer).
6. `npm test` verde antes de concluir; mudanças em `main/` exigem smoke em `npm run web` e/ou `npm start`.
