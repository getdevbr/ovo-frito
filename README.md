# Ovo Frito

Cliente HTTP 100% **Local-First** para APIs — desktop (Electron 35) com modo web fallback, formato nativo `.ovo` e CLI headless. Nenhum dado sai da máquina exceto quando você dispara uma requisição.

- **Desktop:** `npm start` (Electron, `contextIsolation` + preload IPC)
- **Web:** `npm run web` → `http://127.0.0.1:3456`
- **CLI:** `node cli.js run <arquivo.ovo|pasta>`
- **Dados:** `./data/` (ou `CDO_DATA_DIR`); cofre AES-256-GCM em `data/vault.enc.json`

---

# Manual do Ovo Frito — Cliente HTTP 100% Local-First

Guia completo de todas as funcionalidades do Ovo Frito: cliente de API desktop (Electron) com modo web fallback, formato nativo `.ovo`, CLI headless e princípio inegociável de **local-first** — nenhum dado sai da máquina exceto quando você dispara uma requisição.

---

## 1. O que é

Ovo Frito é um cliente HTTP para APIs (estilo Postman/Bruno) que roda localmente:

- **Desktop:** Electron 35 + Node.js, janela única, `contextIsolation` ativado e `nodeIntegration` desativado.
- **Web fallback:** `server-fallback.js` serve a mesma interface em `http://127.0.0.1:3456` sem Electron.
- **CLI:** `cli.js` executa coleções `.ovo` em modo headless para CI/CD.
- **Dados:** JSON em `./data/` (ou `CDO_DATA_DIR`). Cofre de segredos em `data/vault.enc.json` (AES-256-GCM).

---

## 2. Instalação e execução

```powershell
npm.cmd install
npm.cmd start        # abre o app Electron
npm.cmd run web      # modo web em http://127.0.0.1:3456
```

Variável de ambiente `CDO_DATA_DIR` isola o diretório de dados (ver `docs/MANUAL_BUILD.md`).

---

## 3. Interface principal

- **Sidebar:** Collections, Environments, Histórico, Settings. Busca rápida, filtro, abas laterais, arrastar-e-soltar de pastas/requests.
- **Editor de requisição:** nome, método, URL com preview interpolado, Params, Headers, Body, Assertions, Captures, Scripts.
- **Painel de resposta:** status, tempo, tamanho, headers, cookies, corpo com viewers dedicados, waterfall de latência.
- **Command Palette:** `Ctrl+K` (ou `Cmd+K`) para buscar requests/commands.
- **Settings:** tema, layout, timeout, limite de resposta, proxy/mTLS e certificado.

---

## 4. Requisições HTTP

- Métodos HTTP completos, headers e query params com toggle enabled.
- Body modes: `none`, `json`/`raw`, `graphql`, `urlencoded`, `formdata` (com upload de arquivo local), `multipart`.
- Beautify JSON, filtro JSON na resposta, histórico por requisição (últimas 30 execuções) com replay.
- Duplicar, renomear, mover entre pastas e salvar requests/collections pela UI.
- Request chaining: `{{@NomeDaRequest.json.campo}}` e `{{@last.json.campo}}` para usar respostas anteriores.
- Cookies automáticos por domínio (`data/cookies.json`).
- Proxy HTTP/HTTPS, bypass por host, mTLS (certificado cliente + passphrase), opção de ignorar erro de certificado — tudo configurável em Settings → Network.

### 4.1 Autenticação

| Tipo | Descrição |
| :--- | :--- |
| No Auth / Inherit | Sem auth ou herda da Collection |
| Bearer Token | `Authorization: Bearer <token>` com suporte a variáveis e chaining |
| Basic Auth | username/password em Base64 |
| API Key | header ou query param customizável |
| OAuth 2.0 | Client Credentials e Password Credentials via token URL local |
| OAuth 2.0 + PKCE | Authorization Code + PKCE (S256) com callback HTTP efêmero em `127.0.0.1` (Electron) |
| AWS Signature v4 | Assinatura SigV4 nativa (access key, secret, region, service, session token) |
| Digest Auth | Responde automaticamente ao desafio `401 Digest` e repete a requisição |

Auth também pode ser definido no nível da Collection e herdado pelas requests.

### 4.2 OAuth 2.0 + PKCE (Authorization Code)

1. Aba **Authorization** → tipo `OAuth 2.0` → Grant Type `Authorization Code + PKCE`.
2. Preencha Authorization URL, Token URL, Client ID, Scopes e Redirect Port.
3. Clique em **Autorizar PKCE**: o app gera `code_verifier`/`code_challenge`, sobe um servidor efêmero em `127.0.0.1:<porta>/callback`, valida `state` e abre o navegador.
4. Ao final, o `access_token` é gravado no campo de token e pode ser usado como Bearer.

### 4.3 AWS Signature v4 e Digest

- **AWS SigV4:** assina canonical request (method, URI, query ordenada, headers, payload hash SHA-256) com derivação HMAC `AWS4-HMAC-SHA256`. Campos: Access Key ID, Secret Access Key, Region, Service, Session Token.
- **Digest:** primeira resposta `401` com `WWW-Authenticate: Digest` dispara parse do challenge, montagem do header `Digest` (realm, nonce, qop=auth, nc, cnonce) e retry automático.

---

## 5. Variáveis e geradores

- Variáveis por Collection e por Environment (`{{nome}}`), com flag **Secret** que mascara o valor (`••••`) e zera em exports.
- Variáveis de ambiente ativas via Profiles de Environment; trava anti-acidente para métodos destrutivos em profiles marcados.
- Autocomplete de variáveis nos campos de texto (`{{`).
- Geradores dinâmicos `{{$random...}}`: UUID v4, timestamp, ISO date, nomes, e-mail, CPF/CNPJ válidos, Celular BR.
- Geradores fintech/ERP BR: `{{$randomPixPayload}}`, `{{$randomBoleto}}`, `{{$randomCartaoCredito}}` (Luhn), `{{$randomPlacaMercosul}}`, `{{$randomCEP}}`, `{{$randomInscricaoEstadualSP}}`, CRC16.
- `.env` import/export para variáveis de ambiente.
- **Profiles** por Environment com variáveis próprias e contorno visual na requisição.
- **Comparar Profile/Env** (`⚖️`): executa a mesma request em dois Profiles/Environments e mostra diff A/B das respostas.

---

## 6. Assertions, captures e scripts

- **Assertions:** status, header, JSON path, body raw, operadores (`==`, `!=`, `>`, `<`, `contains`, `regex`, etc.). Resultado por teste na resposta.
- **Captures:** extrai valores da resposta (JSON path) para variáveis de ambiente/coleção.
- **Pre-request script:** executa antes de interpolar variáveis (API `pm.*`).
- **Post-response script:** executa após a resposta para encadear dados.

---

## 7. Collections e organização

- Collections com auth padrão, variáveis e pastas multi-nível (`pasta/subpasta`).
- Drag-and-drop na sidebar para mover requests/pastas; renomear pasta atualiza prefixos sem tocar irmãos.
- Collection Runner sequencial com progresso, filtro e chaining entre requests.
- Import/export:
  - **`.ovo` nativo:** request, collection e workspace — exportação sanitiza segredos (tokens, senhas, chaves e headers sensíveis saem vazios; referências `{{var}}`/`{{@chain}}` são preservadas).
  - **`.bru` (Bruno), Postman v2.1 e cURL:** importação e exportação de snippets.

---

## 8. Resposta e análise

- Viewers: Pretty (JSON formatado), Raw, Headers, Cookies.
- **Tabela ordenável** para respostas JSON array de objetos + exportação **CSV** (RFC 4180, 10k×20 colunas testado <200 ms).
- **Viewers binários:** imagens, PDF, HTML (preview em `iframe sandbox`, scripts bloqueados), sniffing de conteúdo textual vs binário.
- **Waterfall de latência:** pill no meta da resposta com DNS, TCP, TLS, TTFB e Download medidos via socket (`lookup`/`connect`/`secureConnect`/headers/fim).
- **Inspetor JWT offline:** decodifica header/payload de tokens Bearer/OAuth2, mostra `exp`/`iat` legíveis e badge de expirado/válido.

---

## 9. Produtividade

- **Auto-Poll:** reexecuta a request até condição (tentativas/intervalo) com botão parar.
- **Contrato JSON Schema:** gera schema draft 2020-12 a partir da resposta e valida requests futuras (JSON Pointer nos erros).
- **Gerador de tipagens:** exporta tipos da resposta em TypeScript, Zod, Python (Pydantic), Java (Record) e Go (Struct).
- **GraphQL introspection:** botão `🧬 GQL` envia query `__schema` na URL ativa e renderiza query/mutation/subscription types, fields, args e enums.
- **Documentação estática:** botão `📄 Docs` exporta a Collection em **Markdown** (`API_DOCS.md`) ou **HTML single-file** com preview local.

---

## 10. Serviços locais (todos bind `127.0.0.1`)

| Serviço | Botão | Função |
| :--- | :--- | :--- |
| Mock Server | `🎭 Mock` | Sobe servidor HTTP local com rotas/exemplos da Collection em 1 clique |
| Load Test | `🚀 Carga` | Stress local com concorrência, iterações/duração, RPS e percentis p50/p95/p99, stop por run |
| Folder Sync | `🗂 Sync` | Espelha Collection em pasta `.ovo` no disco com watcher, flush e resolução de conflitos |
| Proxy Capture | `📡 Captura` | Proxy HTTP local que captura tráfego (inclui túnel CONNECT) e salva requests como `.ovo` |
| WebSocket | `🔌 WS` | Cliente `ws://`/`wss://` com log bidirecional e salvamento de template na Collection |
| SSE | `📡 SSE` | Inspector de `text/event-stream` com start/stop via `fetch` + `AbortController` |
| Cofre | `🗝 Cofre` | Vault AES-256-GCM com master password: unlock/lock, get/set/delete de segredos, persistência em `data/vault.enc.json` |

---

## 11. CLI headless

```powershell
node cli.js run <arquivo.ovo|pasta-com-.ovo> [opções]
# ou após npm link / instalação global:
ovo-frito run ./minha-collection --report junit --output junit.xml
```

Opções: `--var KEY=VALUE`, `--env-file <path>`, `--report json|junit`, `--output <path>`, `--stop-on-failure`, `--timeout <ms>`, `--data-dir <path>`.

- Aceita `.ovo` unitário, pasta com `collection.ovo` + requests, formato envelope (`type: request|collection`) e formato flat do folder-sync.
- Interpola variáveis, collection vars, generators e response chaining; avalia assertions.
- Exit code `1` se qualquer request falhar. Relatórios JSON ou JUnit para CI/CD.

---

## 12. Segurança e privacidade

- Todo tráfego fica na máquina; mock/proxy fazem bind apenas em loopback.
- Segredos: variáveis `secret` mascaradas, auth sanitizada em `.ovo`, headers sensíveis (`Authorization`, `Cookie`, `X-API-Key`, etc.) exportados vazios.
- Cofre AES-256-GCM com PBKDF2 (120k iterações) — master password nunca é persistida.
- OAuth PKCE usa callback efêmero em `127.0.0.1`, `state` validado, servidor fechado ao final/timeout/cancel.
- Electron: `contextIsolation: true`, `nodeIntegration: false`; renderer fala com main só via preload/IPC.

---

## 13. Limitações conhecidas

- OAuth PKCE depende de `shell.openExternal` → **somente Electron** (web fallback retorna unsupported).
- SSE/WebSocket rodam no renderer (browser APIs); não passam pelo motor HTTP do main.
- Cofre protege segredos em repouso; interpolação `{{vault.*}}` e refresh automático de token OAuth são próximos ciclos.
- E2E requer `ELECTRON_RUN_AS_NODE` ausente (o spec já remove a variável no launch).

---

## 14. Testes

```powershell
npm.cmd test              # unit + integration (node --test)
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run test:e2e      # Playwright + Electron
npm.cmd run test:coverage
```

---

## Apêndice — Build e empacotamento

O empacotamento usa `electron-builder` (config em `package.json` → `build`).

### Windows (NSIS + Portable)

```powershell
npm.cmd run dist
```

Saída em `dist/`:
- `Ovo Frito Setup <versão>.exe` — instalador NSIS
- `Ovo Frito <versão>.exe` — executável portátil (cria `./data/` ao lado do `.exe`)
- `win-unpacked/` — pasta desempacotada

### Linux / macOS

```bash
npx electron-builder --linux   # AppImage e .deb
npx electron-builder --mac     # .dmg
```

### Diretório de dados portátil

Em modo empacotado, os JSON (`collections.json`, `environments.json`, `settings.json`, `cookies.json`, `sessions.json`, `history.json`) ficam em `./data/` ao lado do executável. Para isolar dados (testes, múltiplos perfis):

```powershell
$env:CDO_DATA_DIR = "C:\caminho\custom\data"
npm.cmd start
```

> Documentação interna de planejamento (`docs/`) não é versionada — este README é a referência oficial do projeto.
