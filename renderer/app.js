/**
 * Carteiro — 100% Local-First API Client
 * Sprint 1 + Sprint 2 + Quick Wins:
 * - Request Chaining entre Requisições/Sessões ({{@Req.json.token}} + seletor visual na aba Auth)
 * - Body multipart/form-data com upload de arquivos locais
 * - Auth: Bearer, Basic, API Key e OAuth 2.0 Local Helper
 * - Cookie Jar automático por domínio (./data/cookies.json)
 * - Compatibilidade Bruno (.bru Import/Export) + Postman v2.1 + cURL
 * - Variáveis Secretas (Masked) + Import/Export .env
 * - Collection Runner sequencial com encadeamento + Filtro JSON na resposta
 */

const IPC = {
  async invoke(channel, payload) {
    if (window.pm && window.pm.sdk && window.pm.sdk.IPC) {
      return await window.pm.sdk.IPC.invoke(channel, payload);
    }
    const res = await fetch('/api/ipc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, payload })
    });
    return await res.json();
  }
};

const state = {
  collections: [],
  environments: [],
  history: [],
  cookies: [],
  settings: {
    theme: 'dark',
    activeEnvironmentId: ''
  },
  sessions: {
    tabs: [],
    activeTabId: null,
    responseCache: {}
  },
  tabs: [],
  activeTabId: null,
  responseViewMode: 'pretty',
  responseJsonFilter: '',
  sidebarFilter: '',
  renamingCollectionId: null,
  renamingRequestId: null,
  collapsedCollections: {}
};

// Sincronização em tempo real entre múltiplas janelas/abas/sessões locais
const sessionChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('carteiro_session_sync') : null;
if (sessionChannel) {
  sessionChannel.onmessage = async (ev) => {
    if (ev.data?.type === 'storage_updated') {
      const fresh = await IPC.invoke('pm:storage:loadAll');
      if (fresh.environments) state.environments = fresh.environments;
      if (fresh.sessions?.responseCache) state.sessions.responseCache = fresh.sessions.responseCache;
      if (fresh.cookies) state.cookies = fresh.cookies;
      if (fresh.settings) state.settings = fresh.settings;
      renderSidebar();
      renderActiveRequest();
    }
  };
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateUuidV4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateRandomCpf() {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
  const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  digits.push(d1);

  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += digits[i] * (11 - i);
  const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  digits.push(d2);
  return digits.join('');
}

function generateRandomCnpj() {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  digits.push(0, 0, 0, 1);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) sum1 += digits[i] * w1[i];
  const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  digits.push(d1);

  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum2 = 0;
  for (let i = 0; i < 13; i++) sum2 += digits[i] * w2[i];
  const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  digits.push(d2);
  return digits.join('');
}

function generateRandomCelular() {
  const ddds = ['11', '21', '31', '41', '51', '61', '71', '81', '85'];
  const ddd = ddds[Math.floor(Math.random() * ddds.length)];
  const rest = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `${ddd}9${rest}`;
}

function generateRandomName() {
  const firstNames = ['Lucas', 'Mariana', 'Gabriel', 'Beatriz', 'Rafael', 'Camila', 'Thiago', 'Fernanda', 'Bruno', 'Aline'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Ferreira', 'Almeida', 'Pereira', 'Carvalho', 'Ribeiro'];
  const f = firstNames[Math.floor(Math.random() * firstNames.length)];
  const l = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${f} ${l}`;
}

function generateRandomEmail() {
  const handles = ['usuario', 'cliente', 'dev', 'contato', 'teste', 'qa'];
  const h = handles[Math.floor(Math.random() * handles.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${h}.${num}@exemplo.com.br`;
}

function createBlankTab(overrides = {}) {
  const defaultBody = { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] };
  const mergedBody = overrides.body ? { ...defaultBody, ...structuredClone(overrides.body) } : defaultBody;
  if (!Array.isArray(mergedBody.urlencoded)) mergedBody.urlencoded = [];
  if (!Array.isArray(mergedBody.formdata)) mergedBody.formdata = [];

  const defaultAuth = {
    type: 'none',
    token: '',
    username: '',
    password: '',
    keyName: '',
    keyValue: '',
    addTo: 'header',
    grantType: 'client_credentials',
    tokenUrl: '',
    clientId: '',
    clientSecret: ''
  };

  return {
    id: uid('tab'),
    pinned: Boolean(overrides.pinned),
    collectionId: overrides.collectionId || null,
    collectionItemId: overrides.collectionItemId || overrides.id || null,
    name: overrides.name || 'Nova Requisição',
    folder: overrides.folder || '',
    method: overrides.method || 'GET',
    url: overrides.url || 'https://jsonplaceholder.typicode.com/posts?_limit=3',
    params: overrides.params ? structuredClone(overrides.params) : [{ key: '_limit', value: '3', enabled: true }],
    headers: overrides.headers ? structuredClone(overrides.headers) : [{ key: 'Accept', value: 'application/json', enabled: true }],
    auth: overrides.auth ? { ...defaultAuth, ...structuredClone(overrides.auth) } : defaultAuth,
    body: mergedBody,
    assertions: overrides.assertions
      ? structuredClone(overrides.assertions)
      : [{ source: 'status', operator: '==', target: '200', enabled: true }],
    captures: overrides.captures ? structuredClone(overrides.captures) : [],
    preRequestScript: overrides.preRequestScript || '',
    postResponseScript: overrides.postResponseScript || '',
    scriptConsoleLogs: Array.isArray(overrides.scriptConsoleLogs) ? structuredClone(overrides.scriptConsoleLogs) : [],
    history: Array.isArray(overrides.history) ? structuredClone(overrides.history) : [],
    response: overrides.response || null,
    testResults: overrides.testResults || null,
    loading: false
  };
}

function getActiveTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}

function getActiveEnvironment() {
  return state.environments.find((e) => e.id === state.settings.activeEnvironmentId) || null;
}

/**
 * Normaliza e retorna a configuração de Profile e Contorno de um Environment.
 * O usuário cria seus próprios profiles livremente (sem profiles default como dev/homol/prod)
 * e escolhe se cada um possui contorno colorido na requisição ou sem contorno customizado.
 */
function ensureEnvProfileStructure(env) {
  if (!env) return null;
  if (!Array.isArray(env.customProfiles)) {
    env.customProfiles = [];
  }
  if (!env.profileVariables || typeof env.profileVariables !== 'object') {
    env.profileVariables = {};
  }
  if (env.borderColor === undefined) {
    env.borderColor = '';
  }
  // Remove valores legados fixos ('dev', 'homol', 'prod', 'custom') caso não sejam profiles criados pelo usuário
  if (env.profile && !env.customProfiles.some((cp) => cp.id === env.profile)) {
    env.profile = '';
  }
  if (!env.profile) {
    env.profile = '';
  }
  return env;
}

function getEnvProfileMeta(env) {
  if (!env) {
    return { profileKey: '', label: '', icon: '⚪', borderColor: '', hasContour: false };
  }
  ensureEnvProfileStructure(env);
  const customProf = (env.customProfiles || []).find((cp) => cp.id === env.profile);
  if (customProf) {
    const color = customProf.borderColor || '';
    return {
      profileKey: customProf.id,
      label: customProf.name,
      icon: color ? '🎨' : '🏷️',
      borderColor: color,
      hasContour: Boolean(color)
    };
  }
  const baseColor = env.borderColor || '';
  return {
    profileKey: '',
    label: '',
    icon: baseColor ? '🎨' : '🌐',
    borderColor: baseColor,
    hasContour: Boolean(baseColor)
  };
}

function switchEnvironmentActiveProfile(env, nextProfileKey, explicitColor = undefined) {
  if (!env) return;
  ensureEnvProfileStructure(env);
  const prevKey = env.profile || '__base__';

  // Salva variáveis atuais no mapa do profile anterior
  env.profileVariables[prevKey] = structuredClone(env.variables || []);

  const validNext = (env.customProfiles || []).some((cp) => cp.id === nextProfileKey) ? nextProfileKey : '';
  env.profile = validNext;
  const targetKey = validNext || '__base__';

  const cp = (env.customProfiles || []).find((x) => x.id === validNext);
  if (cp) {
    if (explicitColor !== undefined) {
      cp.borderColor = explicitColor;
    }
    env.borderColor = cp.borderColor || '';
  } else if (explicitColor !== undefined) {
    env.borderColor = explicitColor;
  }

  // Se o novo profile já tiver variáveis próprias salvas, carrega; caso contrário clona as variáveis atuais
  if (Array.isArray(env.profileVariables[targetKey]) && env.profileVariables[targetKey].length > 0) {
    env.variables = structuredClone(env.profileVariables[targetKey]);
  } else {
    env.profileVariables[targetKey] = structuredClone(env.variables || []);
  }
}

function applyActiveEnvProfileContour() {
  const workbench = document.querySelector('.workbench');
  const badge = document.getElementById('reqProfileContourBadge');
  const quickSelect = document.getElementById('envProfileQuickSelect');
  const quickColor = document.getElementById('envQuickColorPicker');
  const env = getActiveEnvironment();
  const meta = getEnvProfileMeta(env);

  // Sincroniza seletor rápido de Profile na Topbar (apenas profiles criados pelo usuário)
  if (quickSelect) {
    quickSelect.innerHTML = `<option value="">Sem Profile</option>`;
    if (env && Array.isArray(env.customProfiles)) {
      env.customProfiles.forEach((cp) => {
        const opt = document.createElement('option');
        opt.value = cp.id;
        opt.textContent = `${cp.borderColor ? '🎨' : '🏷️'} ${cp.name}`;
        quickSelect.appendChild(opt);
      });
    }
    const createOpt = document.createElement('option');
    createOpt.value = '__create__';
    createOpt.textContent = '+ Criar Profile...';
    quickSelect.appendChild(createOpt);

    quickSelect.value = env ? meta.profileKey : '';
  }

  if (quickColor) {
    if (env && meta.hasContour && meta.borderColor) {
      quickColor.classList.remove('hidden');
      quickColor.value = meta.borderColor;
    } else {
      quickColor.classList.add('hidden');
    }
  }

  if (!workbench) return;

  if (env && meta.hasContour && meta.borderColor) {
    workbench.classList.add('has-req-profile-contour');
    workbench.style.setProperty('--req-profile-border-color', meta.borderColor);
    workbench.style.setProperty('--req-profile-tint', `${meta.borderColor}24`);
    if (badge) {
      badge.classList.remove('hidden');
      badge.style.backgroundColor = meta.borderColor;
      badge.style.borderColor = meta.borderColor;
      badge.textContent = meta.label ? `${meta.icon} ${meta.label}` : `${meta.icon} ${env.name}`;
      badge.title = meta.label
        ? `Environment "${env.name}" • Profile "${meta.label}" (${meta.borderColor})`
        : `Environment "${env.name}" (${meta.borderColor})`;
    }
  } else {
    workbench.classList.remove('has-req-profile-contour');
    workbench.style.removeProperty('--req-profile-border-color');
    workbench.style.removeProperty('--req-profile-tint');
    if (badge) {
      badge.classList.add('hidden');
    }
  }
}

/**
 * Localiza a última resposta salva de uma requisição pelo nome, ID ou `@last`
 */
function findCachedResponseByRequestRef(reqRef) {
  const ref = (reqRef || '').trim();
  const cache = state.sessions?.responseCache || {};

  if (ref.toLowerCase() === 'last') {
    if (cache.__last && cache.__last.response) return cache.__last.response;
    const withRes = state.tabs.find((t) => t.response && t.response.ok);
    if (withRes) return withRes.response;
  }

  const tabMatch = state.tabs.find(
    (t) =>
      t.response &&
      ((t.name || '').trim().toLowerCase() === ref.toLowerCase() || (t.id || '').toLowerCase() === ref.toLowerCase())
  );
  if (tabMatch) return tabMatch.response;

  if (cache[ref]?.response) return cache[ref].response;
  for (const [key, entry] of Object.entries(cache)) {
    if (key.toLowerCase() === ref.toLowerCase() && entry?.response) {
      return entry.response;
    }
  }
  return null;
}

function isActiveProfileConfirmDestructive(env) {
  if (!env) return false;
  ensureEnvProfileStructure(env);
  if (env.profile) {
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) return Boolean(cp.confirmDestructive);
  }
  return Boolean(env.confirmDestructive);
}

function getAllAvailableVariables(tab = getActiveTab()) {
  const list = [];
  const seen = new Set();

  // 1. Variáveis do Environment / Profile ativo
  const env = getActiveEnvironment();
  if (env && Array.isArray(env.variables)) {
    const meta = getEnvProfileMeta(env);
    const scopeName = meta.label ? `Profile: ${meta.label}` : `Env: ${env.name}`;
    for (const v of env.variables) {
      if (v && v.enabled !== false && v.key && !seen.has(v.key.trim())) {
        seen.add(v.key.trim());
        list.push({
          key: v.key.trim(),
          value: v.secret ? '••••••••' : String(v.value ?? ''),
          rawValue: String(v.value ?? ''),
          scope: scopeName
        });
      }
    }
  }

  // 2. Variáveis da Collection vinculada à aba ativa
  if (tab && tab.collectionId) {
    const col = state.collections.find((c) => c.id === tab.collectionId);
    if (col && Array.isArray(col.variables)) {
      for (const v of col.variables) {
        if (v && v.enabled !== false && v.key && !seen.has(v.key.trim())) {
          seen.add(v.key.trim());
          list.push({
            key: v.key.trim(),
            value: String(v.value ?? ''),
            rawValue: String(v.value ?? ''),
            scope: `Collection: ${col.name}`
          });
        }
      }
    }
  }

  // 3. Variáveis dinâmicas nativas (Faker Offline + Geradores BR 🇧🇷)
  [
    { key: '$uuid', value: 'UUID v4 aleatório', scope: 'Dinâmica' },
    { key: '$guid', value: 'UUID v4 aleatório', scope: 'Dinâmica' },
    { key: '$timestamp', value: 'Unix epoch (segundos)', scope: 'Dinâmica' },
    { key: '$isoDate', value: 'Data ISO-8601 UTC', scope: 'Dinâmica' },
    { key: '$randomInt', value: 'Inteiro aleatório 0..999', scope: 'Dinâmica' },
    { key: '$randomEmail', value: 'E-mail aleatório (@exemplo.com.br)', scope: 'Dinâmica' },
    { key: '$randomName', value: 'Nome completo aleatório', scope: 'Dinâmica' },
    { key: '$randomCPF', value: 'CPF válido com dígito verificador (11 dígitos)', scope: 'Dinâmica 🇧🇷' },
    { key: '$randomCNPJ', value: 'CNPJ válido com dígito verificador (14 dígitos)', scope: 'Dinâmica 🇧🇷' },
    { key: '$randomCelular', value: 'Celular brasileiro (DDD + 9xxxxxxxx)', scope: 'Dinâmica 🇧🇷' },
    ...(window.CDO?.generatorsBr?.REGISTRY || [])
      .filter((g) => !['$uuid', '$guid', '$randomEmail', '$randomName', '$randomCPF', '$randomCNPJ', '$randomCelular'].includes(g.token))
      .map((g) => ({ key: g.token, value: g.label, scope: 'Dinâmica 🇧🇷' }))
  ].forEach((d) => list.push({ ...d, rawValue: d.value }));

  return list;
}

/**
 * Interpola variáveis do Environment/Profile `{{var}}` + Variáveis da Collection + Iteração do Runner
 * + Referências entre Requisições/Sessões `{{@NomeRequest.json.token}}`
 * + Variáveis Dinâmicas (`{{$uuid}}`, `{{$timestamp}}`, `{{$isoDate}}`, `{{$randomCPF}}`, `{{$randomCNPJ}}`, etc.)
 */
function interpolateVariables(str) {
  if (typeof str !== 'string' || !str.includes('{{')) return str;
  const map = {};

  // 1. Variáveis da Collection (menor precedência)
  const activeTab = getActiveTab();
  if (activeTab && activeTab.collectionId) {
    const col = state.collections.find((c) => c.id === activeTab.collectionId);
    if (col && Array.isArray(col.variables)) {
      for (const v of col.variables) {
        if (v && v.enabled !== false && v.key) {
          map[v.key.trim()] = v.value ?? '';
        }
      }
    }
  }

  // 2. Variáveis do Environment / Profile ativo
  const env = getActiveEnvironment();
  if (env && Array.isArray(env.variables)) {
    for (const v of env.variables) {
      if (v && v.enabled !== false && v.key) {
        map[v.key.trim()] = v.value ?? '';
      }
    }
  }

  // 3. Variáveis da linha atual do Data File no Collection Runner (maior precedência)
  if (state.runnerIterationVars && typeof state.runnerIterationVars === 'object') {
    for (const [rk, rv] of Object.entries(state.runnerIterationVars)) {
      map[rk.trim()] = String(rv ?? '');
    }
  }

  return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, varName) => {
    const k = varName.trim();
    if (k === '$guid' || k === '$uuid') return generateUuidV4();
    if (k === '$timestamp') return String(Math.floor(Date.now() / 1000));
    if (k === '$isoTimestamp' || k === '$isoDate') return new Date().toISOString();
    if (k === '$randomInt') return String(Math.floor(Math.random() * 1000));
    if (k === '$randomEmail') return generateRandomEmail();
    if (k === '$randomName') return generateRandomName();
    if (k === '$randomCPF') return generateRandomCpf();
    if (k === '$randomCNPJ') return generateRandomCnpj();
    if (k === '$randomCelular') return generateRandomCelular();
    if (window.CDO?.generatorsBr?.GENERATOR_MAP && typeof window.CDO.generatorsBr.GENERATOR_MAP[k] === 'function') {
      return String(window.CDO.generatorsBr.GENERATOR_MAP[k]());
    }

    if (k.startsWith('@')) {
      const expr = k.slice(1).trim();
      const dotIdx = expr.indexOf('.');
      if (dotIdx !== -1) {
        const reqRef = expr.slice(0, dotIdx).trim();
        const fieldExpr = expr.slice(dotIdx + 1).trim();
        const targetRes = findCachedResponseByRequestRef(reqRef);
        if (targetRes) {
          let parsed = null;
          try {
            parsed = JSON.parse(targetRes.body);
          } catch {}
          const val = resolveResponseSourceValue(targetRes, parsed, fieldExpr);
          if (val !== undefined && val !== null) {
            return typeof val === 'object' ? JSON.stringify(val) : String(val);
          }
        }
      }
      return match;
    }

    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : match;
  });
}

async function persistStore(key) {
  await IPC.invoke('pm:storage:save', { key, data: state[key] });
  if (sessionChannel && ['environments', 'sessions', 'settings', 'cookies'].includes(key)) {
    sessionChannel.postMessage({ type: 'storage_updated', key });
  }
}

async function saveSessionState() {
  state.sessions.tabs = state.tabs.map((t) => ({
    id: t.id,
    collectionId: t.collectionId || null,
    collectionItemId: t.collectionItemId || null,
    name: t.name,
    folder: t.folder || '',
    method: t.method,
    url: t.url,
    params: t.params,
    headers: t.headers,
    auth: t.auth,
    body: t.body,
    assertions: t.assertions,
    captures: t.captures,
    preRequestScript: t.preRequestScript || '',
    postResponseScript: t.postResponseScript || '',
    history: Array.isArray(t.history) ? t.history : [],
    response: t.response,
    testResults: t.testResults
  }));
  state.sessions.activeTabId = state.activeTabId;
  state.settings.responseCache = state.sessions.responseCache;
  try {
    localStorage.setItem('carteiro_sessions_backup', JSON.stringify(state.sessions));
  } catch {}
  await persistStore('sessions');
  await persistStore('settings');
}

function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  const btn = document.getElementById('btnToggleTheme');
  if (btn) {
    btn.textContent = normalized === 'dark' ? '☀ Tema: Escuro (Mudar p/ Claro)' : '🌙 Tema: Claro (Mudar p/ Escuro)';
  }
}

/* Sincronização entre Query Params e URL */
function syncUrlFromParams(tab) {
  if (!tab) return;
  const baseUrl = (tab.url || '').split('?')[0];
  const enabledParams = (tab.params || []).filter((p) => p.enabled !== false && p.key.trim() !== '');
  if (enabledParams.length === 0) {
    tab.url = baseUrl;
  } else {
    const queryStr = enabledParams
      .map((p) => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value ?? '')}`)
      .join('&');
    tab.url = `${baseUrl}?${queryStr}`;
  }
  document.getElementById('reqUrl').value = tab.url;
}

function syncParamsFromUrl(tab) {
  if (!tab) return;
  const parts = (tab.url || '').split('?');
  if (parts.length < 2) {
    tab.params = [];
    return;
  }
  const query = parts.slice(1).join('?');
  const pairs = query.split('&').filter(Boolean);
  tab.params = pairs.map((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return { key: decodeURIComponent(pair), value: '', enabled: true };
    return {
      key: decodeURIComponent(pair.slice(0, idx)),
      value: decodeURIComponent(pair.slice(idx + 1)),
      enabled: true
    };
  });
}

/* ============================================================================
 * US-01: Parser de comando cURL
 * ============================================================================ */
function tokenizeCurlCommand(cmd) {
  const cleaned = cmd
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^\r?\n/g, ' ')
    .trim();

  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '\\' && !inSingle && i + 1 < cleaned.length) {
      current += cleaned[++i];
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function parseCurlCommand(rawText) {
  const tokens = tokenizeCurlCommand(rawText);
  if (tokens.length === 0 || !/^curl(\.exe)?$/i.test(tokens[0])) {
    return null;
  }

  let method = '';
  let url = '';
  const headers = [];
  const dataParts = [];
  const urlencodedParts = [];
  let auth = { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === '-X' || t === '--request') && i + 1 < tokens.length) {
      method = tokens[++i].toUpperCase();
    } else if ((t === '-H' || t === '--header') && i + 1 < tokens.length) {
      const hRaw = tokens[++i];
      const colonIdx = hRaw.indexOf(':');
      if (colonIdx !== -1) {
        const key = hRaw.slice(0, colonIdx).trim();
        const value = hRaw.slice(colonIdx + 1).trim();
        if (key.toLowerCase() === 'authorization' && /^bearer\s+/i.test(value)) {
          auth.type = 'bearer';
          auth.token = value.replace(/^bearer\s+/i, '').trim();
        } else {
          headers.push({ key, value, enabled: true });
        }
      }
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(t) && i + 1 < tokens.length) {
      dataParts.push(tokens[++i]);
    } else if (t === '--data-urlencode' && i + 1 < tokens.length) {
      const pair = tokens[++i];
      const eq = pair.indexOf('=');
      if (eq !== -1) {
        urlencodedParts.push({ key: pair.slice(0, eq), value: pair.slice(eq + 1), enabled: true });
      } else {
        urlencodedParts.push({ key: pair, value: '', enabled: true });
      }
    } else if ((t === '-u' || t === '--user') && i + 1 < tokens.length) {
      const creds = tokens[++i];
      const colon = creds.indexOf(':');
      auth.type = 'basic';
      auth.username = colon !== -1 ? creds.slice(0, colon) : creds;
      auth.password = colon !== -1 ? creds.slice(colon + 1) : '';
    } else if (t === '--url' && i + 1 < tokens.length) {
      url = tokens[++i];
    } else if (!t.startsWith('-') && !url && /^https?:\/\//i.test(t)) {
      url = t;
    } else if (!t.startsWith('-') && !url && t.includes('.')) {
      url = t;
    }
  }

  let body = { mode: 'none', raw: '', urlencoded: [], formdata: [] };
  if (urlencodedParts.length > 0) {
    body = { mode: 'urlencoded', raw: '', urlencoded: urlencodedParts, formdata: [] };
    if (!method) method = 'POST';
  } else if (dataParts.length > 0) {
    const joined = dataParts.join('&');
    let isJson = false;
    try {
      JSON.parse(joined);
      isJson = true;
    } catch {
      isJson = headers.some((h) => h.key.toLowerCase() === 'content-type' && h.value.includes('json'));
    }
    body = { mode: isJson ? 'json' : 'raw', raw: joined, urlencoded: [], formdata: [] };
    if (!method) method = 'POST';
  }

  if (!method) method = 'GET';

  const tempTab = createBlankTab({
    name: `cURL: ${method} ${url.split('?')[0].slice(0, 32)}`,
    method,
    url,
    params: [],
    headers: headers.length > 0 ? headers : [{ key: 'Accept', value: 'application/json', enabled: true }],
    auth,
    body
  });
  syncParamsFromUrl(tempTab);
  return tempTab;
}

/* ============================================================================
 * US-12A: Conversor Bruno (.bru) <-> Carteiro (100% Local Git-Native)
 * ============================================================================ */
function parseBruFile(bruText) {
  if (!/\b(meta|get|post|put|patch|delete|head|options)\s*\{/i.test(bruText)) return null;

  function extractBlock(nameRegex) {
    const re = new RegExp(`(?:^|\\n)\\s*(${nameRegex})\\s*\\{([\\s\\S]*?)\\n\\}`, 'i');
    const m = bruText.match(re);
    return m ? { tag: m[1].trim().toLowerCase(), content: m[2] } : null;
  }

  const meta = extractBlock('meta');
  let reqName = 'Bruno Request';
  if (meta) {
    const nm = meta.content.match(/name:\s*(.+)/i);
    if (nm) reqName = nm[1].trim();
  }

  const methodBlock = extractBlock('get|post|put|patch|delete|head|options');
  const method = methodBlock ? methodBlock.tag.toUpperCase() : 'GET';
  let url = '';
  if (methodBlock) {
    const um = methodBlock.content.match(/url:\s*(.+)/i);
    if (um) url = um[1].trim();
  }

  const headers = [];
  const headersBlock = extractBlock('headers');
  if (headersBlock) {
    headersBlock.content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const disabled = trimmed.startsWith('~');
      const clean = disabled ? trimmed.slice(1).trim() : trimmed;
      const idx = clean.indexOf(':');
      if (idx !== -1) {
        headers.push({ key: clean.slice(0, idx).trim(), value: clean.slice(idx + 1).trim(), enabled: !disabled });
      }
    });
  }

  let auth = { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' };
  const bearerBlock = extractBlock('auth:bearer');
  if (bearerBlock) {
    const tm = bearerBlock.content.match(/token:\s*(.+)/i);
    auth.type = 'bearer';
    auth.token = tm ? tm[1].trim() : '';
  }

  let body = { mode: 'none', raw: '', urlencoded: [], formdata: [] };
  const jsonBlock = extractBlock('body:json');
  const textBlock = extractBlock('body:text');
  if (jsonBlock) {
    body = { mode: 'json', raw: jsonBlock.content.trim(), urlencoded: [], formdata: [] };
  } else if (textBlock) {
    body = { mode: 'raw', raw: textBlock.content.trim(), urlencoded: [], formdata: [] };
  }

  const assertions = [];
  const assertBlock = extractBlock('assert');
  if (assertBlock) {
    assertBlock.content.split(/\r?\n/).forEach((line) => {
      const m = line.trim().match(/^([^:]+):\s*(eq|neq|lt|lte|gt|contains|exists)\s*(.*)$/i);
      if (m) {
        const src = m[1].trim().replace(/^res\.body\./, 'json.').replace(/^res\./, '');
        const opMap = { eq: '==', neq: '!=', lt: '<', lte: '<=', gt: '>', contains: 'contains', exists: 'exists' };
        assertions.push({ source: src, operator: opMap[m[2].toLowerCase()] || '==', target: m[3].trim(), enabled: true });
      }
    });
  }

  const tab = createBlankTab({
    name: reqName,
    method,
    url,
    headers: headers.length > 0 ? headers : [{ key: 'Accept', value: 'application/json', enabled: true }],
    auth,
    body,
    assertions: assertions.length > 0 ? assertions : [{ source: 'status', operator: '==', target: '200', enabled: true }]
  });
  syncParamsFromUrl(tab);
  return tab;
}

function generateBruContent(tab) {
  if (!tab) return '';
  const methodLower = (tab.method || 'GET').toLowerCase();
  const bodyTag = tab.body?.mode === 'json' ? 'json' : tab.body?.mode === 'raw' ? 'text' : tab.body?.mode === 'urlencoded' ? 'formUrlEncoded' : 'none';
  const authTag = tab.auth?.type === 'bearer' ? 'bearer' : tab.auth?.type === 'basic' ? 'basic' : 'none';

  const lines = [
    `meta {`,
    `  name: ${tab.name || 'Request'}`,
    `  type: http`,
    `  seq: 1`,
    `}`,
    ``,
    `${methodLower} {`,
    `  url: ${tab.url || ''}`,
    `  body: ${bodyTag}`,
    `  auth: ${authTag}`,
    `}`
  ];

  const activeParams = (tab.params || []).filter((p) => p.key);
  if (activeParams.length > 0) {
    lines.push(``, `params:query {`);
    activeParams.forEach((p) => {
      lines.push(`  ${p.enabled === false ? '~' : ''}${p.key}: ${p.value ?? ''}`);
    });
    lines.push(`}`);
  }

  const activeHeaders = (tab.headers || []).filter((h) => h.key);
  if (activeHeaders.length > 0) {
    lines.push(``, `headers {`);
    activeHeaders.forEach((h) => {
      lines.push(`  ${h.enabled === false ? '~' : ''}${h.key}: ${h.value ?? ''}`);
    });
    lines.push(`}`);
  }

  if (tab.auth?.type === 'bearer' && tab.auth.token) {
    lines.push(``, `auth:bearer {`, `  token: ${tab.auth.token}`, `}`);
  }

  if (tab.body?.mode === 'json' && tab.body.raw) {
    lines.push(``, `body:json {`, tab.body.raw, `}`);
  } else if (tab.body?.mode === 'raw' && tab.body.raw) {
    lines.push(``, `body:text {`, tab.body.raw, `}`);
  }

  const activeAsserts = (tab.assertions || []).filter((a) => a.enabled !== false && a.source);
  if (activeAsserts.length > 0) {
    const revOp = { '==': 'eq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', contains: 'contains', exists: 'exists' };
    lines.push(``, `assert {`);
    activeAsserts.forEach((a) => {
      const brSrc = a.source === 'status' ? 'res.status' : a.source.startsWith('json.') ? `res.body.${a.source.slice(5)}` : `res.${a.source}`;
      lines.push(`  ${brSrc}: ${revOp[a.operator] || 'eq'} ${a.target ?? ''}`);
    });
    lines.push(`}`);
  }

  return lines.join('\n');
}

/* ============================================================================
 * Formato Nativo Carro do Ovo (.ovo) — Exportação e Importação 100% Local
 * ============================================================================ */
function generateOvoContent(tab) {
  if (!tab) return '';
  const ovoDoc = {
    format: 'carro-do-ovo/v1',
    type: 'request',
    app: 'Carro do Ovo — 100% Local-First API Client',
    exportedAt: new Date().toISOString(),
    request: {
      name: tab.name || 'Requisição',
      folder: tab.folder || '',
      method: tab.method || 'GET',
      url: tab.url || '',
      params: tab.params || [],
      headers: tab.headers || [],
      auth: tab.auth || { type: 'none' },
      body: tab.body || { mode: 'none' },
      assertions: tab.assertions || [],
      captures: tab.captures || [],
      preRequestScript: tab.preRequestScript || '',
      postResponseScript: tab.postResponseScript || '',
      history: Array.isArray(tab.history) ? tab.history : []
    }
  };
  return JSON.stringify(ovoDoc, null, 2);
}

function exportRequestAsOvo(tab) {
  if (!tab) return;
  const content = generateOvoContent(tab);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = (tab.name || 'requisicao').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'requisicao';
  a.download = `${slug}.ovo`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('statusMessage').textContent = `Arquivo nativo "${slug}.ovo" exportado com sucesso!`;
}

function exportCollectionAsOvo(col) {
  if (!col) return;
  const ovoCol = {
    format: 'carro-do-ovo/v1',
    type: 'collection',
    app: 'Carro do Ovo — 100% Local-First API Client',
    exportedAt: new Date().toISOString(),
    collection: {
      id: col.id,
      name: col.name,
      auth: col.auth || { type: 'none' },
      variables: Array.isArray(col.variables) ? col.variables : [],
      items: (col.items || []).map((it) => ({
        ...it,
        history: Array.isArray(it.history) ? it.history : []
      }))
    }
  };
  const blob = new Blob([JSON.stringify(ovoCol, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = (col.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
  a.download = `${slug}.ovo`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('statusMessage').textContent = `Collection "${col.name}" exportada no formato nativo "${slug}.ovo"!`;
}

function exportWorkspaceAsOvo() {
  const ovoWorkspace = {
    format: 'carro-do-ovo/v1',
    type: 'workspace',
    app: 'Carro do Ovo — 100% Local-First API Client',
    exportedAt: new Date().toISOString(),
    collections: state.collections || [],
    environments: state.environments || [],
    settings: {
      theme: state.settings?.theme || 'dark',
      activeEnvironmentId: state.settings?.activeEnvironmentId || '',
      ignoreCertErrors: state.settings?.ignoreCertErrors ?? true,
      timeoutMs: state.settings?.timeoutMs || 30000
    }
  };
  const blob = new Blob([JSON.stringify(ovoWorkspace, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const dateSlug = new Date().toISOString().slice(0, 10);
  a.download = `carro-do-ovo-workspace-${dateSlug}.ovo`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('statusMessage').textContent = `Workspace completo exportado como "carro-do-ovo-workspace-${dateSlug}.ovo"!`;
}

function parseOvoFile(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    if (
      parsed &&
      (parsed.format?.startsWith('carro-do-ovo') ||
        parsed.type === 'request' ||
        parsed.type === 'collection' ||
        parsed.type === 'workspace')
    ) {
      if (parsed.type === 'workspace') {
        return {
          kind: 'workspace',
          collections: Array.isArray(parsed.collections) ? parsed.collections : [],
          environments: Array.isArray(parsed.environments) ? parsed.environments : []
        };
      }
      if (parsed.type === 'request' && parsed.request) {
        return { kind: 'request', tab: createBlankTab(parsed.request) };
      }
      if (parsed.type === 'collection' && parsed.collection) {
        return {
          kind: 'collection',
          collection: {
            ...parsed.collection,
            id: uid('col'),
            variables: Array.isArray(parsed.collection.variables) ? parsed.collection.variables : [],
            items: (parsed.collection.items || []).map((it) => ({
              ...it,
              id: it.id || uid('req'),
              history: Array.isArray(it.history) ? it.history : []
            }))
          }
        };
      }
    }
  } catch {}
  return null;
}

/* ============================================================================
 * US-02: Gerador de Snippets de Código (Codegen) + Nativo .ovo
 * ============================================================================ */
function generateCodeSnippet(tab, lang) {
  if (!tab) return '';
  if (lang === 'ovo') return generateOvoContent(tab);
  if (lang === 'bru') return generateBruContent(tab);

  const method = (tab.method || 'GET').toUpperCase();
  const url = interpolateVariables(tab.url || 'http://localhost');
  const headersObj = {};

  for (const h of tab.headers || []) {
    if (h && h.enabled !== false && h.key) {
      headersObj[interpolateVariables(h.key.trim())] = interpolateVariables(String(h.value ?? ''));
    }
  }

  const effAuth = resolveEffectiveTabAuth(tab);
  if (effAuth) {
    if ((effAuth.type === 'bearer' || effAuth.type === 'oauth2') && effAuth.token) {
      headersObj['Authorization'] = `Bearer ${interpolateVariables(effAuth.token)}`;
    } else if (effAuth.type === 'basic' && (effAuth.username || effAuth.password)) {
      const b64 = btoa(`${interpolateVariables(effAuth.username || '')}:${interpolateVariables(effAuth.password || '')}`);
      headersObj['Authorization'] = `Basic ${b64}`;
    } else if (effAuth.type === 'apikey' && effAuth.keyName && effAuth.keyValue && effAuth.addTo !== 'query') {
      headersObj[interpolateVariables(effAuth.keyName)] = interpolateVariables(effAuth.keyValue);
    }
  }

  let bodyStr = '';
  if (!['GET', 'HEAD'].includes(method) && tab.body) {
    if (tab.body.mode === 'json' || tab.body.mode === 'raw') {
      bodyStr = interpolateVariables(tab.body.raw || '');
      if (tab.body.mode === 'json' && !Object.keys(headersObj).some((k) => k.toLowerCase() === 'content-type')) {
        headersObj['Content-Type'] = 'application/json';
      }
    } else if (tab.body.mode === 'graphql') {
      let gVars = {};
      try {
        gVars = JSON.parse(interpolateVariables(tab.body.graphqlVars || '{}'));
      } catch {}
      bodyStr = JSON.stringify({ query: interpolateVariables(tab.body.graphqlQuery || ''), variables: gVars }, null, 2);
      if (!Object.keys(headersObj).some((k) => k.toLowerCase() === 'content-type')) {
        headersObj['Content-Type'] = 'application/json';
      }
    } else if (tab.body.mode === 'urlencoded') {
      const sp = new URLSearchParams();
      for (const u of tab.body.urlencoded || []) {
        if (u && u.enabled !== false && u.key) {
          sp.append(interpolateVariables(u.key), interpolateVariables(u.value || ''));
        }
      }
      bodyStr = sp.toString();
      if (!Object.keys(headersObj).some((k) => k.toLowerCase() === 'content-type')) {
        headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  if (lang === 'curl') {
    const net = ensureNetworkSettings();
    const lines = [`curl -X ${method} "${url}"`];
    if (net.ignoreCertErrors) {
      lines.push(`  --insecure`);
    }
    if (net.proxy?.enabled && net.proxy?.host) {
      const pProto = net.proxy.protocol || 'http';
      const pHost = interpolateVariables(net.proxy.host);
      const pPort = interpolateVariables(String(net.proxy.port || '8080'));
      const pUser = interpolateVariables(net.proxy.username || '');
      const pPass = interpolateVariables(net.proxy.password || '');
      const authPrefix = pUser || pPass ? `${encodeURIComponent(pUser)}:${encodeURIComponent(pPass)}@` : '';
      lines.push(`  -x "${pProto}://${authPrefix}${pHost}:${pPort}"`);
    }
    for (const [k, v] of Object.entries(headersObj)) {
      lines.push(`  -H "${k}: ${v.replace(/"/g, '\\"')}"`);
    }
    if (bodyStr) {
      lines.push(`  -d '${bodyStr.replace(/'/g, "'\\''")}'`);
    }
    return lines.join(' \\\n');
  }

  if (lang === 'fetch') {
    const opts = { method, headers: headersObj };
    if (bodyStr) opts.body = bodyStr;
    return `const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(opts, null, 2)});\nconst data = await response.json();\nconsole.log(data);`;
  }

  if (lang === 'axios') {
    const cfg = { method: method.toLowerCase(), url, headers: headersObj };
    if (bodyStr) {
      try {
        cfg.data = JSON.parse(bodyStr);
      } catch {
        cfg.data = bodyStr;
      }
    }
    return `const axios = require('axios');\n\nconst response = await axios(${JSON.stringify(cfg, null, 2)});\nconsole.log(response.data);`;
  }

  if (lang === 'python') {
    const lines = [
      `import requests`,
      ``,
      `url = ${JSON.stringify(url)}`,
      `headers = ${JSON.stringify(headersObj, null, 2)}`,
      bodyStr ? `payload = ${JSON.stringify(bodyStr)}` : `payload = None`,
      ``,
      `response = requests.request(${JSON.stringify(method)}, url, headers=headers, data=payload)`,
      `print(response.status_code)`,
      `print(response.text)`
    ];
    return lines.join('\n');
  }

  if (lang === 'powershell') {
    const lines = [`$headers = @{`];
    for (const [k, v] of Object.entries(headersObj)) {
      lines.push(`  "${k}" = "${v.replace(/"/g, '`"')}"`);
    }
    lines.push(`}`);
    let cmd = `Invoke-RestMethod -Uri "${url}" -Method ${method} -Headers $headers`;
    if (bodyStr) {
      lines.push(`$body = @'\n${bodyStr}\n'@`);
      cmd += ` -Body $body`;
    }
    lines.push(cmd);
    return lines.join('\n');
  }

  return '';
}

/* ============================================================================
 * US-03: Importar / Exportar Postman Collection v2.1 JSON
 * ============================================================================ */
function convertPostmanCollectionToCarteiro(pmJson) {
  const colName = pmJson.info?.name || pmJson.name || 'Collection Importada';
  const items = [];

  function walkItems(nodeList, folderPrefix = '') {
    for (const entry of nodeList || []) {
      if (Array.isArray(entry.item)) {
        const nextFolder = folderPrefix ? `${folderPrefix} / ${entry.name || 'Folder'}` : (entry.name || '');
        walkItems(entry.item, nextFolder);
      } else if (entry.request) {
        const req = entry.request;
        const method = (typeof req === 'string' ? 'GET' : req.method || 'GET').toUpperCase();
        let url = '';
        if (typeof req.url === 'string') {
          url = req.url;
        } else if (req.url && typeof req.url.raw === 'string') {
          url = req.url.raw;
        }

        const headers = (req.header || []).map((h) => ({
          key: h.key || '',
          value: h.value || '',
          enabled: !h.disabled
        }));

        let auth = { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' };
        if (req.auth) {
          if (req.auth.type === 'bearer') {
            const tk = (req.auth.bearer || []).find((x) => x.key === 'token');
            auth.type = 'bearer';
            auth.token = tk ? tk.value : '';
          } else if (req.auth.type === 'basic') {
            const u = (req.auth.basic || []).find((x) => x.key === 'username');
            const p = (req.auth.basic || []).find((x) => x.key === 'password');
            auth.type = 'basic';
            auth.username = u ? u.value : '';
            auth.password = p ? p.value : '';
          }
        }

        let body = { mode: 'none', raw: '', urlencoded: [], formdata: [] };
        if (req.body) {
          if (req.body.mode === 'raw') {
            const rawStr = req.body.raw || '';
            let isJson = req.body.options?.raw?.language === 'json';
            if (!isJson) {
              try {
                JSON.parse(rawStr);
                isJson = true;
              } catch {}
            }
            body = { mode: isJson ? 'json' : 'raw', raw: rawStr, urlencoded: [], formdata: [] };
          } else if (req.body.mode === 'urlencoded') {
            body = {
              mode: 'urlencoded',
              raw: '',
              urlencoded: (req.body.urlencoded || []).map((u) => ({
                key: u.key || '',
                value: u.value || '',
                enabled: !u.disabled
              })),
              formdata: []
            };
          }
        }

        const temp = createBlankTab({
          name: entry.name || url,
          folder: folderPrefix,
          method,
          url,
          headers,
          auth,
          body
        });
        syncParamsFromUrl(temp);
        items.push({
          id: uid('req'),
          name: temp.name,
          folder: folderPrefix,
          method: temp.method,
          url: temp.url,
          params: temp.params,
          headers: temp.headers,
          auth: temp.auth,
          body: temp.body,
          assertions: temp.assertions,
          captures: temp.captures
        });
      }
    }
  }

  walkItems(pmJson.item || []);
  return {
    id: uid('col'),
    name: colName,
    items
  };
}

/* ============================================================================
 * US-16: Importador OpenAPI 3.0 / Swagger 2.0 JSON -> Collection Carteiro
 * ============================================================================ */
function buildOpenApiSampleFromSchema(schema, rootSpec, depth = 0) {
  if (!schema || depth > 4) return {};
  if (schema.$ref && typeof schema.$ref === 'string') {
    const refParts = schema.$ref.replace(/^#\//, '').split('/');
    let resolved = rootSpec;
    for (const p of refParts) resolved = resolved?.[p];
    if (resolved) return buildOpenApiSampleFromSchema(resolved, rootSpec, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object' || schema.properties) {
    const obj = {};
    for (const [k, propSchema] of Object.entries(schema.properties || {})) {
      obj[k] = buildOpenApiSampleFromSchema(propSchema, rootSpec, depth + 1);
    }
    return obj;
  }
  if (schema.type === 'array') {
    return [buildOpenApiSampleFromSchema(schema.items || { type: 'string' }, rootSpec, depth + 1)];
  }
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  return 'string';
}

function convertOpenApiToCarteiro(spec) {
  const title = spec.info?.title || 'OpenAPI Importada';
  let baseUrl = 'http://localhost:3000';
  if (Array.isArray(spec.servers) && spec.servers[0]?.url) {
    baseUrl = spec.servers[0].url.replace(/\/$/, '');
  } else if (spec.host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes[0] ? spec.schemes[0] : 'https';
    baseUrl = `${scheme}://${spec.host}${(spec.basePath || '').replace(/\/$/, '')}`;
  }

  const items = [];
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const [routePath, pathObj] of Object.entries(spec.paths || {})) {
    if (!pathObj || typeof pathObj !== 'object') continue;
    for (const m of httpMethods) {
      const op = pathObj[m];
      if (!op) continue;

      const folder = Array.isArray(op.tags) && op.tags[0] ? op.tags[0] : '';
      const name = op.summary || op.operationId || `${m.toUpperCase()} ${routePath}`;
      const params = [];
      const headers = [{ key: 'Accept', value: 'application/json', enabled: true }];

      const allParams = [...(pathObj.parameters || []), ...(op.parameters || [])];
      for (const p of allParams) {
        if (p.in === 'query') {
          params.push({ key: p.name, value: p.example ?? p.default ?? '', enabled: !!p.required });
        } else if (p.in === 'header') {
          headers.push({ key: p.name, value: p.example ?? p.default ?? '', enabled: true });
        }
      }

      let body = { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] };
      const jsonMedia = op.requestBody?.content?.['application/json'];
      if (jsonMedia) {
        const sample = jsonMedia.example ?? buildOpenApiSampleFromSchema(jsonMedia.schema, spec);
        body = {
          mode: 'json',
          raw: JSON.stringify(sample, null, 2),
          graphqlQuery: '',
          graphqlVars: '{\n  \n}',
          urlencoded: [],
          formdata: []
        };
        headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
      }

      const fullUrl = `${baseUrl}${routePath.startsWith('/') ? '' : '/'}${routePath}`;
      const tab = createBlankTab({
        name,
        folder,
        method: m.toUpperCase(),
        url: fullUrl,
        params,
        headers,
        body
      });
      syncUrlFromParams(tab);
      items.push({
        id: uid('req'),
        name: tab.name,
        folder: tab.folder,
        method: tab.method,
        url: tab.url,
        params: tab.params,
        headers: tab.headers,
        auth: tab.auth,
        body: tab.body,
        assertions: tab.assertions,
        captures: tab.captures,
        preRequestScript: '',
        postResponseScript: ''
      });
    }
  }

  return {
    id: uid('col'),
    name: `${title} (OpenAPI)`,
    items
  };
}

function exportCollectionAsPostmanV21(col) {
  const pmObj = {
    info: {
      _postman_id: generateUuidV4(),
      name: col.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: (col.items || []).map((it) => ({
      name: it.name || it.url,
      request: {
        method: it.method || 'GET',
        header: (it.headers || [])
          .filter((h) => h.key)
          .map((h) => ({ key: h.key, value: h.value || '', disabled: h.enabled === false })),
        url: {
          raw: it.url || '',
          query: (it.params || [])
            .filter((p) => p.key)
            .map((p) => ({ key: p.key, value: p.value || '', disabled: p.enabled === false }))
        },
        body:
          it.body?.mode === 'json' || it.body?.mode === 'raw'
            ? {
                mode: 'raw',
                raw: it.body.raw || '',
                options: { raw: { language: it.body.mode === 'json' ? 'json' : 'text' } }
              }
            : it.body?.mode === 'urlencoded'
            ? {
                mode: 'urlencoded',
                urlencoded: (it.body.urlencoded || []).map((u) => ({
                  key: u.key,
                  value: u.value || '',
                  disabled: u.enabled === false
                }))
              }
            : undefined
      }
    }))
  };

  const blob = new Blob([JSON.stringify(pmObj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(col.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.postman_collection.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============================================================================
 * US-09: Avaliador de Assertions Declarativas & Captura Pós-Resposta
 * ============================================================================ */
function getByPath(obj, pathExpr) {
  if (!obj || !pathExpr) return undefined;
  const parts = pathExpr
    .replace(/^json\.?/i, '')
    .split('.')
    .filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function resolveResponseSourceValue(response, parsedJson, sourceExpr) {
  const s = (sourceExpr || '').trim();
  if (s === 'status') return response.status;
  if (s === 'timeMs') return response.timeMs;
  if (s === 'sizeBytes') return response.sizeBytes;
  if (s === 'body') return response.body || '';
  if (s.toLowerCase().startsWith('header.')) {
    const hName = s.slice(7).trim().toLowerCase();
    for (const [k, v] of Object.entries(response.headers || {})) {
      if (k.toLowerCase() === hName) return Array.isArray(v) ? v.join(', ') : String(v);
    }
    return undefined;
  }
  if (s.toLowerCase().startsWith('json.') || s.toLowerCase() === 'json') {
    return getByPath(parsedJson, s);
  }
  return getByPath(parsedJson, s);
}

async function evaluateAssertionsAndCaptures(tab, response) {
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(response.body);
  } catch {}

  const assertionOutcomes = [];
  for (const a of tab.assertions || []) {
    if (!a || a.enabled === false || !a.source) continue;
    const actual = resolveResponseSourceValue(response, parsedJson, a.source);
    const op = a.operator || '==';
    const expected = interpolateVariables(String(a.target ?? ''));
    let passed = false;

    if (op === 'exists') {
      passed = actual !== undefined && actual !== null;
    } else if (op === '==') {
      passed = String(actual) === expected;
    } else if (op === '!=') {
      passed = String(actual) !== expected;
    } else if (op === '<') {
      passed = Number(actual) < Number(expected);
    } else if (op === '<=') {
      passed = Number(actual) <= Number(expected);
    } else if (op === '>') {
      passed = Number(actual) > Number(expected);
    } else if (op === 'contains') {
      passed = String(actual ?? '').toLowerCase().includes(expected.toLowerCase());
    }

    assertionOutcomes.push({
      source: a.source,
      operator: op,
      target: expected,
      actual: actual === undefined ? 'undefined' : typeof actual === 'object' ? JSON.stringify(actual) : String(actual),
      passed
    });
  }

  const captureOutcomes = [];
  let envUpdated = false;
  for (const c of tab.captures || []) {
    if (!c || c.enabled === false || !c.key || !c.value) continue;
    const sourcePath = c.key.trim();
    const targetVarName = c.value.trim().replace(/^\{\{|\}\}$/g, '');
    const extracted = resolveResponseSourceValue(response, parsedJson, sourcePath);

    if (extracted !== undefined) {
      let env = getActiveEnvironment();
      if (!env) {
        if (state.environments.length === 0) {
          env = { id: uid('env'), name: 'Default Environment', variables: [] };
          state.environments.push(env);
        } else {
          env = state.environments[0];
        }
        state.settings.activeEnvironmentId = env.id;
      }
      const strVal = typeof extracted === 'object' ? JSON.stringify(extracted) : String(extracted);
      const existingVar = env.variables.find((v) => v.key === targetVarName);
      if (existingVar) {
        existingVar.value = strVal;
        existingVar.enabled = true;
      } else {
        env.variables.push({ key: targetVarName, value: strVal, enabled: true, secret: /token|secret|key|pass/i.test(targetVarName) });
      }
      envUpdated = true;
      captureOutcomes.push({ source: sourcePath, varName: targetVarName, value: strVal, ok: true });
    } else {
      captureOutcomes.push({ source: sourcePath, varName: targetVarName, value: 'não encontrado', ok: false });
    }
  }

  if (envUpdated) {
    await persistStore('environments');
    await persistStore('settings');
  }

  // Executa Post-response Script (pm.test / pm.expect / pm.environment.set) se configurado
  if (tab.postResponseScript && tab.postResponseScript.trim()) {
    const scriptResults = await executePostResponseScript(tab, response, parsedJson);
    assertionOutcomes.push(...scriptResults.assertions);
    captureOutcomes.push(...scriptResults.captures);
  }

  tab.testResults = {
    assertions: assertionOutcomes,
    captures: captureOutcomes
  };
}

/* ============================================================================
 * US-10: Executor de Pre-request & Post-response Scripts (Compatível com `pm.*`)
 * ============================================================================ */
function getOrInitActiveEnvForScripts() {
  let env = getActiveEnvironment();
  if (!env) {
    if (state.environments.length === 0) {
      env = { id: uid('env'), name: 'Default Environment', variables: [] };
      state.environments.push(env);
    } else {
      env = state.environments[0];
    }
    state.settings.activeEnvironmentId = env.id;
  }
  return env;
}

function createScriptConsoleProxy(tab, phase = 'Pre-request') {
  if (!Array.isArray(tab.scriptConsoleLogs)) tab.scriptConsoleLogs = [];
  const pushLog = (level, args) => {
    const formatted = args
      .map((a) => {
        if (typeof a === 'object' && a !== null) {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
    tab.scriptConsoleLogs.push({
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      phase,
      level,
      message: formatted
    });
  };
  return {
    log: (...args) => {
      console.log(...args);
      pushLog('INFO', args);
    },
    info: (...args) => {
      console.info(...args);
      pushLog('INFO', args);
    },
    warn: (...args) => {
      console.warn(...args);
      pushLog('WARN', args);
    },
    error: (...args) => {
      console.error(...args);
      pushLog('ERROR', args);
    }
  };
}

async function executePreRequestScript(tab) {
  tab.scriptConsoleLogs = [];
  const code = (tab.preRequestScript || '').trim();
  if (!code) return;
  let envDirty = false;
  const env = getOrInitActiveEnvForScripts();

  const envApi = {
    get(key) {
      const found = (env.variables || []).find((v) => v.key === key && v.enabled !== false);
      return found ? found.value : undefined;
    },
    set(key, value) {
      const strVal = String(value ?? '');
      const found = (env.variables || []).find((v) => v.key === key);
      if (found) {
        found.value = strVal;
        found.enabled = true;
      } else {
        env.variables.push({ key: String(key), value: strVal, enabled: true, secret: false });
      }
      envDirty = true;
    }
  };

  const pm = {
    environment: envApi,
    variables: envApi,
    globals: envApi,
    request: {
      headers: {
        add(h) {
          if (h && h.key) {
            tab.headers.push({ key: String(h.key), value: String(h.value ?? ''), enabled: true });
          }
        }
      }
    }
  };

  const scriptConsole = createScriptConsoleProxy(tab, 'Pre-request');
  try {
    const fn = new Function('pm', 'console', code);
    await fn(pm, scriptConsole);
  } catch (err) {
    scriptConsole.error(`Erro no Pre-request Script: ${err.message}`);
  }

  if (envDirty) {
    await persistStore('environments');
    await persistStore('settings');
  }
}

function createChaiLikeExpect(actual) {
  const check = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const api = {
    to: {
      equal(expected) {
        check(actual === expected, `esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
      },
      eql(expected) {
        check(
          JSON.stringify(actual) === JSON.stringify(expected),
          `esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`
        );
      },
      include(sub) {
        check(String(actual ?? '').includes(String(sub)), `"${actual}" não inclui "${sub}"`);
      },
      get exist() {
        check(actual !== undefined && actual !== null, `valor é ${actual}`);
        return true;
      },
      be: {
        get ok() {
          check(!!actual, `valor não é truthy (${actual})`);
          return true;
        },
        above(n) {
          check(Number(actual) > Number(n), `esperado > ${n}, obtido ${actual}`);
        },
        below(n) {
          check(Number(actual) < Number(n), `esperado < ${n}, obtido ${actual}`);
        },
        a(type) {
          const actualType = Array.isArray(actual) ? 'array' : typeof actual;
          check(actualType === String(type).toLowerCase(), `esperado tipo ${type}, obtido ${actualType}`);
        }
      }
    }
  };
  return api;
}

async function executePostResponseScript(tab, response, parsedJson) {
  const code = (tab.postResponseScript || '').trim();
  const assertions = [];
  const captures = [];
  if (!code) return { assertions, captures };

  let envDirty = false;
  const env = getOrInitActiveEnvForScripts();

  const envApi = {
    get(key) {
      const found = (env.variables || []).find((v) => v.key === key && v.enabled !== false);
      return found ? found.value : undefined;
    },
    set(key, value) {
      const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      const found = (env.variables || []).find((v) => v.key === key);
      if (found) {
        found.value = strVal;
        found.enabled = true;
      } else {
        env.variables.push({ key: String(key), value: strVal, enabled: true, secret: /token|secret|key|pass/i.test(key) });
      }
      envDirty = true;
      captures.push({ source: 'pm.environment.set', varName: String(key), value: strVal, ok: true });
    }
  };

  const pm = {
    environment: envApi,
    variables: envApi,
    globals: envApi,
    response: {
      code: response.status,
      status: response.statusText,
      responseTime: response.timeMs,
      headers: response.headers || {},
      text: () => response.body || '',
      json: () => {
        if (parsedJson !== null && parsedJson !== undefined) return parsedJson;
        return JSON.parse(response.body || 'null');
      },
      to: {
        have: {
          status(expectedCode) {
            if (response.status !== expectedCode) {
              throw new Error(`esperado status ${expectedCode}, obtido ${response.status}`);
            }
          },
          header(hName) {
            const exists = Object.keys(response.headers || {}).some((k) => k.toLowerCase() === String(hName).toLowerCase());
            if (!exists) throw new Error(`header "${hName}" ausente`);
          }
        },
        be: {
          get ok() {
            if (response.status < 200 || response.status >= 300) {
              throw new Error(`status ${response.status} não é 2xx`);
            }
            return true;
          }
        }
      }
    },
    expect: (val) => createChaiLikeExpect(val),
    test(testName, fn) {
      try {
        fn();
        assertions.push({
          source: `pm.test`,
          operator: '=>',
          target: testName,
          actual: 'OK',
          passed: true
        });
      } catch (err) {
        assertions.push({
          source: `pm.test`,
          operator: '=>',
          target: testName,
          actual: err.message,
          passed: false
        });
      }
    }
  };

  const scriptConsole = createScriptConsoleProxy(tab, 'Post-response');
  try {
    const runner = new Function('pm', 'console', code);
    await runner(pm, scriptConsole);
  } catch (err) {
    scriptConsole.error(`Erro no Post-response Script: ${err.message}`);
    assertions.push({
      source: 'Script Error',
      operator: '=>',
      target: 'Execução do Script JS',
      actual: err.message,
      passed: false
    });
  }

  if (envDirty) {
    await persistStore('environments');
    await persistStore('settings');
  }

  return { assertions, captures };
}

/* Renderização de Tabelas Key-Value */
function renderKeyValueTable(containerId, rows, onChange, placeholders = { key: 'Chave (Key)', value: 'Valor (Value — suporta {{var}})' }) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhum item configurado.';
    container.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'kv-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
      onChange();
    });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'kv-input';
    keyInput.placeholder = placeholders.key;
    keyInput.value = row.key || '';
    keyInput.addEventListener('input', () => {
      row.key = keyInput.value;
      onChange();
    });

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'kv-input';
    valInput.placeholder = placeholders.value;
    valInput.value = row.value || '';
    valInput.addEventListener('input', () => {
      row.value = valInput.value;
      onChange();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.title = 'Remover linha';
    delBtn.addEventListener('click', () => {
      rows.splice(index, 1);
      renderKeyValueTable(containerId, rows, onChange, placeholders);
      onChange();
    });

    div.appendChild(checkbox);
    div.appendChild(keyInput);
    div.appendChild(valInput);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}

/* Tabela de Variáveis do Environment (com suporte a 🔒 Secret) */
function renderEnvVarsTable(rows) {
  const container = document.getElementById('envVarsTable');
  container.innerHTML = '';

  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhuma variável configurada neste Environment.';
    container.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'env-var-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
    });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'kv-input';
    keyInput.placeholder = 'Nome da variável (ex: api_token)';
    keyInput.value = row.key || '';
    keyInput.addEventListener('input', () => {
      row.key = keyInput.value;
    });

    const valInput = document.createElement('input');
    valInput.type = row.secret ? 'password' : 'text';
    valInput.className = 'kv-input';
    valInput.placeholder = 'Valor';
    valInput.value = row.value || '';
    valInput.addEventListener('input', () => {
      row.value = valInput.value;
    });

    const secretLabel = document.createElement('label');
    secretLabel.style.fontSize = '11px';
    secretLabel.style.display = 'inline-flex';
    secretLabel.style.alignItems = 'center';
    secretLabel.style.gap = '4px';
    secretLabel.style.cursor = 'pointer';
    const secretChk = document.createElement('input');
    secretChk.type = 'checkbox';
    secretChk.checked = !!row.secret;
    secretChk.addEventListener('change', () => {
      row.secret = secretChk.checked;
      valInput.type = row.secret ? 'password' : 'text';
    });
    secretLabel.appendChild(secretChk);
    secretLabel.appendChild(document.createTextNode('🔒 Secret'));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      rows.splice(index, 1);
      renderEnvVarsTable(rows);
    });

    div.appendChild(checkbox);
    div.appendChild(keyInput);
    div.appendChild(valInput);
    div.appendChild(secretLabel);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}

/* Tabela Multipart Form-Data (Texto + Upload de Arquivos Locais) */
function renderMultipartTable(tab) {
  const container = document.getElementById('formdataTable');
  container.innerHTML = '';
  if (!Array.isArray(tab.body.formdata)) tab.body.formdata = [];

  if (tab.body.formdata.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhum campo multipart configurado.';
    container.appendChild(empty);
    return;
  }

  tab.body.formdata.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'multipart-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
    });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'kv-input';
    keyInput.placeholder = 'Nome do campo';
    keyInput.value = row.key || '';
    keyInput.addEventListener('input', () => {
      row.key = keyInput.value;
    });

    const typeSelect = document.createElement('select');
    typeSelect.className = 'select-input';
    [
      { v: 'text', l: 'Texto' },
      { v: 'file', l: 'Arquivo' }
    ].forEach((it) => {
      const opt = document.createElement('option');
      opt.value = it.v;
      opt.textContent = it.l;
      if ((row.type || 'text') === it.v) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', () => {
      row.type = typeSelect.value;
      renderMultipartTable(tab);
    });

    const valWrap = document.createElement('div');
    if (row.type === 'file') {
      const fileLabel = document.createElement('label');
      fileLabel.className = 'btn-small w-full';
      fileLabel.style.display = 'inline-block';
      fileLabel.style.cursor = 'pointer';
      fileLabel.textContent = row.fileName ? `📎 ${row.fileName}` : '📂 Escolher Arquivo Local...';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.className = 'hidden';
      fileInput.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          const commaIdx = dataUrl.indexOf(',');
          row.fileName = f.name;
          row.fileContentType = f.type || 'application/octet-stream';
          row.fileBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : '';
          renderMultipartTable(tab);
        };
        reader.readAsDataURL(f);
      });
      fileLabel.appendChild(fileInput);
      valWrap.appendChild(fileLabel);
    } else {
      const valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.className = 'kv-input';
      valInput.placeholder = 'Valor (suporta {{var}})';
      valInput.value = row.value || '';
      valInput.addEventListener('input', () => {
        row.value = valInput.value;
      });
      valWrap.appendChild(valInput);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      tab.body.formdata.splice(index, 1);
      renderMultipartTable(tab);
    });

    div.appendChild(checkbox);
    div.appendChild(keyInput);
    div.appendChild(typeSelect);
    div.appendChild(valWrap);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}

function renderAssertionsTable(tab) {
  const container = document.getElementById('assertionsTable');
  container.innerHTML = '';
  if (!Array.isArray(tab.assertions)) tab.assertions = [];

  if (tab.assertions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhuma assertion configurada.';
    container.appendChild(empty);
    return;
  }

  tab.assertions.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'assertion-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = row.enabled !== false;
    checkbox.addEventListener('change', () => {
      row.enabled = checkbox.checked;
      renderActiveBadges(tab);
    });

    const srcInput = document.createElement('input');
    srcInput.type = 'text';
    srcInput.className = 'kv-input';
    srcInput.placeholder = 'status | timeMs | json.id | header.content-type';
    srcInput.value = row.source || '';
    srcInput.addEventListener('input', () => {
      row.source = srcInput.value;
      renderActiveBadges(tab);
    });

    const opSelect = document.createElement('select');
    opSelect.className = 'select-input';
    ['==', '!=', '<', '<=', '>', 'contains', 'exists'].forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op;
      if (row.operator === op) opt.selected = true;
      opSelect.appendChild(opt);
    });
    opSelect.addEventListener('change', () => {
      row.operator = opSelect.value;
    });

    const targetInput = document.createElement('input');
    targetInput.type = 'text';
    targetInput.className = 'kv-input';
    targetInput.placeholder = 'Valor esperado (ex: 200)';
    targetInput.value = row.target ?? '';
    targetInput.addEventListener('input', () => {
      row.target = targetInput.value;
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      tab.assertions.splice(index, 1);
      renderAssertionsTable(tab);
      renderActiveBadges(tab);
    });

    div.appendChild(checkbox);
    div.appendChild(srcInput);
    div.appendChild(opSelect);
    div.appendChild(targetInput);
    div.appendChild(delBtn);
    container.appendChild(div);
  });
}

/* Renderização da Barra de Abas + Menu "Fixar / Duplicar / Fechar todas / Todas menos essa / À direita / À esquerda" */
let contextMenuTargetTabId = null;

function sortTabsWithPinnedFirst() {
  const pinned = state.tabs.filter((t) => t.pinned);
  const unpinned = state.tabs.filter((t) => !t.pinned);
  state.tabs = [...pinned, ...unpinned];
}

function openTabsContextMenu(tabId, clientX = null, clientY = null) {
  const menu = document.getElementById('tabsContextMenu');
  const titleEl = document.getElementById('tabsContextMenuTitle');
  const pinBtn = document.getElementById('btnContextPinTab');
  if (!menu) return;

  contextMenuTargetTabId = tabId || state.activeTabId;
  const targetTab = state.tabs.find((t) => t.id === contextMenuTargetTabId);
  if (titleEl && targetTab) {
    titleEl.textContent = `Aba: ${targetTab.name || targetTab.url || 'Sem título'}`;
  }
  if (pinBtn && targetTab) {
    pinBtn.textContent = targetTab.pinned ? '📌 Desafixar esta aba' : '📌 Fixar esta aba';
  }

  menu.classList.remove('hidden');
  if (clientX !== null && clientY !== null) {
    const barRect = document.querySelector('.tabs-bar')?.getBoundingClientRect();
    if (barRect) {
      const leftOffset = Math.min(Math.max(4, clientX - barRect.left), Math.max(4, barRect.width - 225));
      menu.style.left = `${leftOffset}px`;
      menu.style.right = 'auto';
      menu.style.top = '36px';
    }
  } else {
    menu.style.left = 'auto';
    menu.style.right = '6px';
    menu.style.top = '36px';
  }
}

function isTabDirty(tab) {
  if (!tab || !tab.collectionId || !tab.collectionItemId) return false;
  const col = state.collections.find((c) => c.id === tab.collectionId);
  const item = (col?.items || []).find((it) => it.id === tab.collectionItemId);
  if (!item) return false;
  return (
    (tab.name || '') !== (item.name || '') ||
    (tab.method || 'GET') !== (item.method || 'GET') ||
    (tab.url || '') !== (item.url || '') ||
    JSON.stringify(tab.headers || []) !== JSON.stringify(item.headers || []) ||
    JSON.stringify(tab.body || {}) !== JSON.stringify(item.body || {})
  );
}

function executeBulkTabClose(action, refTabId = contextMenuTargetTabId || state.activeTabId) {
  const idx = state.tabs.findIndex((t) => t.id === refTabId);
  if (action === 'toggle-pin' && idx !== -1) {
    state.tabs[idx].pinned = !state.tabs[idx].pinned;
    sortTabsWithPinnedFirst();
  } else if (action === 'duplicate' && idx !== -1) {
    const src = state.tabs[idx];
    const copy = createBlankTab({
      ...structuredClone(src),
      id: uid('tab'),
      pinned: false,
      collectionId: null,
      collectionItemId: null,
      name: `${src.name || 'Requisição'} (Cópia)`
    });
    state.tabs.splice(idx + 1, 0, copy);
    state.activeTabId = copy.id;
  } else if (action === 'close-all') {
    const pinnedTabs = state.tabs.filter((t) => t.pinned);
    if (pinnedTabs.length > 0) {
      state.tabs = pinnedTabs;
      if (!state.tabs.some((t) => t.id === state.activeTabId)) {
        state.activeTabId = state.tabs[0].id;
      }
    } else {
      const blank = createBlankTab();
      state.tabs = [blank];
      state.activeTabId = blank.id;
    }
  } else if (action === 'close-others' && idx !== -1) {
    const keep = state.tabs[idx];
    state.tabs = state.tabs.filter((t) => t.pinned || t.id === keep.id);
    state.activeTabId = keep.id;
  } else if (action === 'close-right' && idx !== -1) {
    state.tabs = state.tabs.filter((t, i) => i <= idx || t.pinned);
    if (!state.tabs.some((t) => t.id === state.activeTabId)) {
      state.activeTabId = state.tabs[state.tabs.length - 1].id;
    }
  } else if (action === 'close-left' && idx !== -1) {
    state.tabs = state.tabs.filter((t, i) => i >= idx || t.pinned);
    if (!state.tabs.some((t) => t.id === state.activeTabId)) {
      state.activeTabId = state.tabs[0].id;
    }
  }

  document.getElementById('tabsContextMenu')?.classList.add('hidden');
  saveSessionState();
  renderAll();
}

function renderTabsBar() {
  const container = document.getElementById('requestTabs');
  container.innerHTML = '';

  state.tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = `req-tab ${tab.id === state.activeTabId ? 'active' : ''}`;
    if (tab.pinned) {
      el.style.borderBottom = '2px solid var(--accent)';
    }
    el.title = tab.pinned
      ? '📌 Aba fixada • Clique com botão direito para desafixar ou duplicar'
      : 'Clique para focar • Botão direito para fixar, duplicar ou fechar abas';
    el.addEventListener('click', () => {
      state.activeTabId = tab.id;
      renderAll();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTabsContextMenu(tab.id, e.clientX, e.clientY);
    });

    const badge = document.createElement('span');
    badge.className = `method-badge method-${tab.method}`;
    badge.textContent = tab.method;

    const title = document.createElement('span');
    title.className = 'req-tab-title';
    const pinPrefix = tab.pinned ? '📌 ' : '';
    const dirtyPrefix = isTabDirty(tab) ? '● ' : '';
    title.textContent = `${pinPrefix}${dirtyPrefix}${tab.name || tab.url || 'Sem título'}`;

    el.appendChild(badge);
    el.appendChild(title);

    if (!tab.pinned && state.tabs.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'req-tab-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      el.appendChild(closeBtn);
    }
    container.appendChild(el);
  });
}

function closeTab(tabId) {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  if (state.tabs[idx].pinned) {
    document.getElementById('statusMessage').textContent = '📌 Esta aba está fixada. Clique com o botão direito na aba para desafixá-la antes de fechar.';
    return;
  }
  state.tabs.splice(idx, 1);
  if (state.tabs.length === 0) {
    const blank = createBlankTab();
    state.tabs.push(blank);
    state.activeTabId = blank.id;
  } else if (state.activeTabId === tabId) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
  }
  saveSessionState();
  renderAll();
}

function updateUrlInterpolatedPreview(tab = getActiveTab()) {
  const bar = document.getElementById('urlInterpolatedPreviewBar');
  const txt = document.getElementById('urlInterpolatedPreviewText');
  const lockEl = document.getElementById('urlSecurityLockIndicator');
  if (!bar || !txt || !tab) return;

  const rawUrl = tab.url || '';
  const hasVars = rawUrl.includes('{{');
  const env = getActiveEnvironment();
  const confirmLock = isActiveProfileConfirmDestructive(env);

  if (!hasVars && !confirmLock) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  if (hasVars) {
    const resolved = interpolateVariables(rawUrl);
    const unresolvedMatch = resolved.match(/\{\{[^}]+\}\}/);
    txt.innerHTML = unresolvedMatch
      ? `🔗 Preview URL: <span style="color:var(--text-primary);">${resolved}</span> <span style="color:#ef4444; margin-left:6px;">(⚠️ Variável ${unresolvedMatch[0]} não definida no Environment/Collection)</span>`
      : `🔗 Preview URL: <span style="color:#10b981;">${resolved}</span>`;
  } else {
    txt.textContent = `🔗 URL: ${rawUrl}`;
  }

  if (lockEl) {
    lockEl.classList.toggle('hidden', !confirmLock);
  }
}

function renderVarAutocompletePopover(filterTerm = '') {
  const pop = document.getElementById('varAutocompletePopover');
  const urlInput = document.getElementById('reqUrl');
  if (!pop || !urlInput) return;

  const vars = getAllAvailableVariables();
  const q = filterTerm.toLowerCase().trim();
  const filtered = vars.filter((v) => !q || v.key.toLowerCase().includes(q) || v.scope.toLowerCase().includes(q));

  pop.innerHTML = `<div class="disposition-section-title">Variáveis Disponíveis (Clique para inserir na URL)</div>`;
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Nenhuma variável encontrada neste Environment / Collection.';
    pop.appendChild(empty);
    return;
  }

  filtered.forEach((v) => {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.style.justifyContent = 'space-between';
    item.innerHTML = `
      <span><strong style="color:var(--accent); font-family:var(--font-mono);">{{${v.key}}}</strong> <span style="font-size:11px; color:var(--text-secondary);">= ${v.value || '(vazio)'}</span></span>
      <span class="badge">${v.scope}</span>
    `;
    item.addEventListener('click', () => {
      const tab = getActiveTab();
      if (!tab) return;
      const curVal = urlInput.value || '';
      const openIdx = curVal.lastIndexOf('{{');
      const closeIdx = curVal.lastIndexOf('}}');
      if (openIdx !== -1 && openIdx > closeIdx) {
        urlInput.value = `${curVal.slice(0, openIdx)}{{${v.key}}}`;
      } else {
        urlInput.value = `${curVal}{{${v.key}}}`;
      }
      tab.url = urlInput.value;
      syncParamsFromUrl(tab);
      updateUrlInterpolatedPreview(tab);
      pop.classList.add('hidden');
      urlInput.focus();
    });
    pop.appendChild(item);
  });
}

function resolveEffectiveTabAuth(tab) {
  if (!tab) return { type: 'none' };
  const authType = tab.auth?.type || 'none';
  if (authType === 'inherit') {
    if (tab.collectionId) {
      const col = state.collections.find((c) => c.id === tab.collectionId);
      if (col && col.auth && col.auth.type && col.auth.type !== 'none') {
        return { ...col.auth, inheritedFromCollection: col.name };
      }
    }
    return { type: 'none', inheritedFromCollection: null };
  }
  return tab.auth || { type: 'none' };
}

function decodeBase64UrlUtf8(part) {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function decodeJwtTokenOffline(rawTokenInput) {
  if (!rawTokenInput || typeof rawTokenInput !== 'string') return null;
  const resolved = interpolateVariables(rawTokenInput.trim()).replace(/^Bearer\s+/i, '').trim();
  const parts = resolved.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
  try {
    const header = JSON.parse(decodeBase64UrlUtf8(parts[0]));
    const payload = JSON.parse(decodeBase64UrlUtf8(parts[1]));
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') return null;
    return { header, payload, rawResolved: resolved };
  } catch {
    return null;
  }
}

function renderJwtInspector(tab) {
  const box = document.getElementById('jwtInspectorBox');
  const statusBadge = document.getElementById('jwtStatusBadge');
  const headerPre = document.getElementById('jwtHeaderPre');
  const payloadPre = document.getElementById('jwtPayloadPre');
  if (!box || !statusBadge || !headerPre || !payloadPre || !tab) return;

  const effectiveAuth = resolveEffectiveTabAuth(tab);
  const effectiveType = effectiveAuth?.type || 'none';
  if (!['bearer', 'oauth2'].includes(effectiveType)) {
    box.classList.add('hidden');
    return;
  }

  const decoded = decodeJwtTokenOffline(effectiveAuth.token || '');
  if (!decoded) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  headerPre.textContent = JSON.stringify(decoded.header, null, 2);

  const enrichedPayload = { ...decoded.payload };
  if (typeof decoded.payload.iat === 'number') {
    enrichedPayload._iat_human = new Date(decoded.payload.iat * 1000).toLocaleString('pt-BR');
  }
  if (typeof decoded.payload.exp === 'number') {
    enrichedPayload._exp_human = new Date(decoded.payload.exp * 1000).toLocaleString('pt-BR');
  }
  payloadPre.textContent = JSON.stringify(enrichedPayload, null, 2);

  if (typeof decoded.payload.exp === 'number') {
    const nowSec = Math.floor(Date.now() / 1000);
    const diffSec = decoded.payload.exp - nowSec;
    if (diffSec > 0) {
      const mins = Math.ceil(diffSec / 60);
      statusBadge.className = 'test-badge-pass';
      statusBadge.textContent = mins > 120
        ? `✅ JWT Válido (expira em ${Math.round(mins / 60)}h)`
        : `✅ JWT Válido (expira em ${mins} min)`;
    } else {
      const minsAgo = Math.ceil(Math.abs(diffSec) / 60);
      statusBadge.className = 'test-badge-fail';
      statusBadge.textContent = minsAgo > 120
        ? `⚠️ JWT Expirado há ${Math.round(minsAgo / 60)}h`
        : `⚠️ JWT Expirado há ${minsAgo} min`;
    }
  } else {
    statusBadge.className = 'badge';
    statusBadge.textContent = 'ℹ️ JWT decodificado (sem claim exp)';
  }
}

/* Renderização do Editor da Requisição Ativa */
function renderActiveRequest() {
  const tab = getActiveTab();
  if (!tab) return;

  if (!Array.isArray(tab.assertions)) tab.assertions = [{ source: 'status', operator: '==', target: '200', enabled: true }];
  if (!Array.isArray(tab.captures)) tab.captures = [];

  document.getElementById('reqNameInput').value = tab.name || '';
  const reqMethodEl = document.getElementById('reqMethod');
  reqMethodEl.value = tab.method || 'GET';
  reqMethodEl.dataset.method = tab.method || 'GET';
  document.getElementById('reqUrl').value = tab.url || '';
  updateUrlInterpolatedPreview(tab);

  const btnSend = document.getElementById('btnSend');
  btnSend.disabled = !!tab.loading;
  btnSend.textContent = tab.loading ? 'Sending...' : 'Send';

  renderActiveBadges(tab);

  renderKeyValueTable('paramsTable', tab.params, () => {
    syncUrlFromParams(tab);
    renderActiveBadges(tab);
  });

  renderKeyValueTable('headersTable', tab.headers, () => {
    renderActiveBadges(tab);
  });

  // Auth
  const authType = tab.auth?.type || 'none';
  document.getElementById('authType').value = authType;
  document.getElementById('authInheritPane')?.classList.toggle('hidden', authType !== 'inherit');
  document.getElementById('authBearerPane').classList.toggle('hidden', authType !== 'bearer');
  document.getElementById('authBasicPane').classList.toggle('hidden', authType !== 'basic');
  document.getElementById('authApiKeyPane').classList.toggle('hidden', authType !== 'apikey');
  document.getElementById('authOAuth2Pane').classList.toggle('hidden', authType !== 'oauth2');
  document.getElementById('authChainBox').classList.toggle('hidden', !['bearer', 'apikey', 'oauth2'].includes(authType));

  if (authType === 'inherit') {
    const inheritSummary = document.getElementById('authInheritSummaryText');
    const col = tab.collectionId ? state.collections.find((c) => c.id === tab.collectionId) : null;
    if (inheritSummary) {
      if (!col) {
        inheritSummary.textContent = '⚠️ Salve esta requisição em uma Collection primeiro para herdar a autenticação da Collection.';
      } else if (!col.auth || !col.auth.type || col.auth.type === 'none') {
        inheritSummary.textContent = `ℹ️ A Collection "${col.name}" está com No Auth. Clique ao lado para configurar o Auth padrão da Collection.`;
      } else {
        const typeLabels = { bearer: 'Bearer Token', basic: 'Basic Auth', apikey: `API Key (${col.auth.keyName || 'X-API-Key'})` };
        inheritSummary.textContent = `✅ Herdando ${typeLabels[col.auth.type] || col.auth.type} da Collection "${col.name}".`;
      }
    }
  }

  document.getElementById('authBearerToken').value = tab.auth?.token || '';
  document.getElementById('authBasicUser').value = tab.auth?.username || '';
  document.getElementById('authBasicPass').value = tab.auth?.password || '';
  document.getElementById('authApiKeyName').value = tab.auth?.keyName || '';
  document.getElementById('authApiKeyValue').value = tab.auth?.keyValue || '';
  document.getElementById('authApiKeyAddTo').value = tab.auth?.addTo || 'header';
  document.getElementById('oauthGrantType').value = tab.auth?.grantType || 'client_credentials';
  document.getElementById('oauthTokenUrl').value = tab.auth?.tokenUrl || '';
  document.getElementById('oauthClientId').value = tab.auth?.clientId || '';
  document.getElementById('oauthClientSecret').value = tab.auth?.clientSecret || '';
  document.getElementById('oauthAccessTokenInput').value = tab.auth?.token || '';

  if (['bearer', 'apikey', 'oauth2'].includes(authType)) {
    renderAuthChainBox(tab);
  }
  renderJwtInspector(tab);

  // Body
  const bodyMode = tab.body?.mode || 'none';
  document.querySelectorAll('input[name="bodyMode"]').forEach((r) => {
    r.checked = r.value === bodyMode;
  });
  document.getElementById('bodyNoneWrap').classList.toggle('hidden', bodyMode !== 'none');
  document.getElementById('bodyRawWrap').classList.toggle('hidden', !(bodyMode === 'json' || bodyMode === 'raw'));
  document.getElementById('bodyGraphqlWrap').classList.toggle('hidden', bodyMode !== 'graphql');
  document.getElementById('bodyUrlEncodedWrap').classList.toggle('hidden', bodyMode !== 'urlencoded');
  document.getElementById('bodyFormDataWrap').classList.toggle('hidden', bodyMode !== 'formdata');
  document.getElementById('btnBeautifyJson').classList.toggle('hidden', bodyMode !== 'json');
  document.getElementById('bodyRawInput').value = tab.body?.raw || '';
  document.getElementById('graphqlQueryInput').value = tab.body?.graphqlQuery || '';
  document.getElementById('graphqlVarsInput').value = tab.body?.graphqlVars || '{\n  \n}';

  if (bodyMode === 'urlencoded') {
    if (!Array.isArray(tab.body.urlencoded)) tab.body.urlencoded = [];
    renderKeyValueTable('urlencodedTable', tab.body.urlencoded, () => {});
  } else if (bodyMode === 'formdata') {
    renderMultipartTable(tab);
  }

  // Scripts (pm.*)
  document.getElementById('preRequestScriptInput').value = tab.preRequestScript || '';
  document.getElementById('postResponseScriptInput').value = tab.postResponseScript || '';

  // Tests & Captura
  renderAssertionsTable(tab);
  renderKeyValueTable(
    'capturesTable',
    tab.captures,
    () => renderActiveBadges(tab),
    { key: 'Origem (ex: json.id ou header.x-token)', value: 'Variável destino (ex: post_id)' }
  );

  renderResponse(tab);
}

function renderActiveBadges(tab) {
  const activeParamsCount = (tab.params || []).filter((p) => p.enabled !== false && p.key).length;
  document.getElementById('badgeParams').textContent = activeParamsCount > 0 ? `(${activeParamsCount})` : '';
  const activeHeadersCount = (tab.headers || []).filter((h) => h.enabled !== false && h.key).length;
  document.getElementById('badgeHeaders').textContent = activeHeadersCount > 0 ? `(${activeHeadersCount})` : '';
  document.getElementById('badgeBody').classList.toggle('visible', tab.body && tab.body.mode !== 'none');

  const testsCount =
    (tab.assertions || []).filter((a) => a.enabled !== false && a.source).length +
    (tab.captures || []).filter((c) => c.enabled !== false && c.key && c.value).length;
  document.getElementById('badgeTests').textContent = testsCount > 0 ? `(${testsCount})` : '';

  const jarCount = (state.cookies || []).length;
  document.getElementById('badgeCookieJar').textContent = jarCount > 0 ? `(${jarCount})` : '';

  const hasScripts = !!(tab.preRequestScript?.trim() || tab.postResponseScript?.trim());
  document.getElementById('badgeScripts')?.classList.toggle('visible', hasScripts);
}

function extractJsonCandidatePaths(obj, prefix = 'json', out = [], depth = 0) {
  if (depth > 3 || obj === null || obj === undefined || out.length >= 25) return out;
  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      extractJsonCandidatePaths(obj[0], `${prefix}.0`, out, depth + 1);
    }
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const nextPath = `${prefix}.${k}`;
      if (v !== null && typeof v === 'object') {
        extractJsonCandidatePaths(v, nextPath, out, depth + 1);
      } else {
        out.push({ path: nextPath, value: String(v) });
      }
    }
  }
  return out;
}

function getAvailableChainSources(currentTabId) {
  const sources = [];
  const seenNames = new Set();

  if (state.sessions?.responseCache?.__last?.response) {
    sources.push({
      ref: 'last',
      label: `⚡ Última executada (${state.sessions.responseCache.__last.name || 'Sessão'})`,
      response: state.sessions.responseCache.__last.response
    });
  }

  for (const t of state.tabs) {
    if (t.id !== currentTabId && t.response && t.response.ok) {
      const name = (t.name || t.url || t.id).trim();
      seenNames.add(name.toLowerCase());
      sources.push({
        ref: name,
        label: `📑 Aba: ${name} (${t.method})`,
        response: t.response
      });
    }
  }

  const cache = state.sessions?.responseCache || {};
  for (const [k, entry] of Object.entries(cache)) {
    if (k === '__last' || !entry?.response) continue;
    if (!seenNames.has(k.toLowerCase())) {
      seenNames.add(k.toLowerCase());
      sources.push({
        ref: k,
        label: `💾 Sessão salva: ${entry.name || k} (${entry.method || 'HTTP'})`,
        response: entry.response
      });
    }
  }

  for (const t of state.tabs) {
    const name = (t.name || t.url || t.id).trim();
    if (t.id !== currentTabId && !seenNames.has(name.toLowerCase())) {
      seenNames.add(name.toLowerCase());
      sources.push({
        ref: name,
        label: `📑 Aba (sem execução ainda): ${name}`,
        response: null
      });
    }
  }

  return sources;
}

function renderAuthChainBox(tab) {
  const reqSelect = document.getElementById('chainSourceReqSelect');
  const fieldSelect = document.getElementById('chainSourceFieldSelect');
  const previewEl = document.getElementById('chainPreviewValue');
  if (!reqSelect || !fieldSelect) return;

  const sources = getAvailableChainSources(tab.id);
  const prevSelectedRef = reqSelect.value;
  reqSelect.innerHTML = '';

  if (sources.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'Login';
    opt.textContent = 'Execute uma request (ex: Login / Criar Post) para listar respostas';
    reqSelect.appendChild(opt);
  } else {
    sources.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.ref;
      opt.textContent = s.label;
      if (s.ref === prevSelectedRef) opt.selected = true;
      reqSelect.appendChild(opt);
    });
  }

  function populateFieldsForSelectedSource() {
    const selectedRef = reqSelect.value || 'last';
    const srcObj = sources.find((s) => s.ref === selectedRef);
    const res = srcObj?.response || findCachedResponseByRequestRef(selectedRef);
    fieldSelect.innerHTML = '';

    const candidates = [];
    if (res && res.body) {
      try {
        const parsed = JSON.parse(res.body);
        extractJsonCandidatePaths(parsed, 'json', candidates);
      } catch {}
    }

    candidates.sort((a, b) => {
      const score = (p) => (/token|jwt|auth|key|secret|id/i.test(p) ? 0 : 1);
      return score(a.path) - score(b.path);
    });

    if (candidates.length === 0) {
      [
        { path: 'json.token', value: 'padrão JWT/Bearer' },
        { path: 'json.access_token', value: 'padrão OAuth2' },
        { path: 'json.data.token', value: 'envelope data' },
        { path: 'json.id', value: 'ID do recurso' },
        { path: 'header.authorization', value: 'Header Authorization' }
      ].forEach((c) => candidates.push(c));
    }

    candidates.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.path;
      const shortVal = String(c.value ?? '').slice(0, 36);
      opt.textContent = `${c.path} (${shortVal})`;
      fieldSelect.appendChild(opt);
    });

    updateChainPreview();
  }

  function updateChainPreview() {
    const expr = `{{@${reqSelect.value || 'last'}.${fieldSelect.value || 'json.token'}}}`;
    const resolved = interpolateVariables(expr);
    if (resolved !== expr) {
      previewEl.textContent = `✓ Valor atual: ${resolved.slice(0, 42)}`;
    } else {
      previewEl.textContent = `Expressão: ${expr}`;
    }
  }

  reqSelect.onchange = populateFieldsForSelectedSource;
  fieldSelect.onchange = updateChainPreview;
  populateFieldsForSelectedSource();
}

/* Renderização da Resposta */
function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function formatHistoryTimestamp(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (' + d.toLocaleDateString('pt-BR') + ')';
  } catch {
    return isoStr;
  }
}

function renderRequestHistoryPane(tab) {
  const badgeResHistory = document.getElementById('badgeResHistory');
  const titleSpan = document.getElementById('resHistoryTitleSpan');
  const listEl = document.getElementById('requestHistoryList');
  if (!listEl) return;

  if (!tab) {
    if (badgeResHistory) badgeResHistory.textContent = '';
    listEl.innerHTML = `<div class="empty-hint">Nenhuma requisição ativa.</div>`;
    return;
  }

  if (!Array.isArray(tab.history)) tab.history = [];
  const hist = tab.history;
  if (badgeResHistory) badgeResHistory.textContent = hist.length > 0 ? `(${hist.length})` : '';
  if (titleSpan) titleSpan.textContent = `🕒 Histórico Individual de "${tab.name || tab.url || 'Requisição'}" (${hist.length} execuções)`;

  listEl.innerHTML = '';
  if (hist.length === 0) {
    listEl.innerHTML = `<div class="empty-hint">Nenhuma execução registrada para "${tab.name || 'esta requisição'}" ainda. Clique em Send para registrar.</div>`;
    return;
  }

  hist.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'test-result-item';
    const isOk = entry.status >= 200 && entry.status < 300;
    const statusBadgeClass = isOk ? 'test-badge-pass' : 'test-badge-fail';
    const statusLabel = entry.status ? `${entry.status} ${entry.statusText || ''}`.trim() : 'ERR';

    const infoSpan = document.createElement('span');
    infoSpan.style.flex = '1';
    infoSpan.innerHTML = `
      <span class="${statusBadgeClass}">${statusLabel}</span>
      <span class="method-badge method-${entry.method || 'GET'}" style="margin-left:6px;">${entry.method || 'GET'}</span>
      <strong>${entry.resolvedUrl || entry.url || ''}</strong>
      <span style="color: var(--text-secondary); margin-left: 8px;">⏱ ${entry.timeMs || 0} ms • ${formatBytes(entry.sizeBytes || 0)} • 🕒 ${formatHistoryTimestamp(entry.timestamp)}</span>
    `;

    const viewResBtn = document.createElement('button');
    viewResBtn.className = 'btn-small';
    viewResBtn.textContent = '👁 Ver Resposta';
    viewResBtn.title = 'Carregar a resposta desta execução no visualizador';
    viewResBtn.addEventListener('click', () => {
      if (entry.response) {
        tab.response = structuredClone(entry.response);
        tab.testResults = entry.testResults ? structuredClone(entry.testResults) : null;
        tab.lastSentInspector = entry.requestSent ? structuredClone(entry.requestSent) : null;
        document.querySelectorAll('[data-res-tab]').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.res-tab-pane').forEach((p) => p.classList.remove('active'));
        document.querySelector('[data-res-tab="body"]')?.classList.add('active');
        document.getElementById('res-tab-body')?.classList.add('active');
        renderResponse(tab);
        document.getElementById('statusMessage').textContent = `Visualizando resposta histórica de ${formatHistoryTimestamp(entry.timestamp)}.`;
      }
    });

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn-small';
    restoreBtn.textContent = '↺ Restaurar Req + Resp';
    restoreBtn.title = 'Restaurar URL, Params, Headers, Body e Resposta desta execução';
    restoreBtn.addEventListener('click', async () => {
      tab.method = entry.method || tab.method;
      tab.url = entry.url || tab.url;
      if (entry.params) tab.params = structuredClone(entry.params);
      if (entry.headers) tab.headers = structuredClone(entry.headers);
      if (entry.auth) tab.auth = structuredClone(entry.auth);
      if (entry.body) tab.body = structuredClone(entry.body);
      if (entry.response) tab.response = structuredClone(entry.response);
      if (entry.testResults) tab.testResults = structuredClone(entry.testResults);
      await syncTabBackToCollectionItem(tab);
      await saveSessionState();
      renderAll();
      document.getElementById('statusMessage').textContent = `Estado da requisição restaurado da execução de ${formatHistoryTimestamp(entry.timestamp)}!`;
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.title = 'Remover esta execução do histórico desta requisição';
    delBtn.addEventListener('click', async () => {
      tab.history.splice(idx, 1);
      await syncTabBackToCollectionItem(tab);
      await saveSessionState();
      renderAll();
    });

    const diffBtn = document.createElement('button');
    diffBtn.className = 'btn-small';
    diffBtn.textContent = '🔀 Diff c/ Atual';
    diffBtn.title = 'Comparar o JSON/Body desta execução histórica com a resposta atual da requisição';
    diffBtn.addEventListener('click', () => {
      openHistoryDiffModal(tab, entry);
    });

    row.appendChild(infoSpan);
    row.appendChild(diffBtn);
    row.appendChild(viewResBtn);
    row.appendChild(restoreBtn);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  });
}

function formatBodyForDiff(rawBody) {
  if (!rawBody) return '';
  try {
    return JSON.stringify(JSON.parse(rawBody), null, 2);
  } catch {
    return String(rawBody);
  }
}

function openHistoryDiffModal(tab, histEntry) {
  const modal = document.getElementById('historyDiffModal');
  const metaBar = document.getElementById('historyDiffMetaBar');
  const diffPre = document.getElementById('historyDiffOutputPre');
  if (!modal || !metaBar || !diffPre || !tab || !histEntry) return;

  const curRes = tab.response || {};
  const oldRes = histEntry.response || {};

  metaBar.innerHTML = `
    <span><strong>Histórico (${formatHistoryTimestamp(histEntry.timestamp)}):</strong> Status ${oldRes.status ?? histEntry.status ?? 0} (${oldRes.timeMs ?? histEntry.timeMs ?? 0} ms)</span>
    <span>⇄</span>
    <span><strong>Resposta Atual:</strong> Status ${curRes.status ?? 0} (${curRes.timeMs ?? 0} ms)</span>
  `;

  const oldLines = formatBodyForDiff(oldRes.body).split('\n');
  const newLines = formatBodyForDiff(curRes.body).split('\n');

  diffPre.innerHTML = '';
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oLine = oldLines[i];
    const nLine = newLines[i];
    if (oLine === nLine) {
      const div = document.createElement('div');
      div.style.color = 'var(--text-secondary)';
      div.textContent = `  ${nLine ?? ''}`;
      diffPre.appendChild(div);
    } else {
      if (oLine !== undefined) {
        const delDiv = document.createElement('div');
        delDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.14)';
        delDiv.style.color = '#f87171';
        delDiv.textContent = `- ${oLine}`;
        diffPre.appendChild(delDiv);
      }
      if (nLine !== undefined) {
        const addDiv = document.createElement('div');
        addDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.14)';
        addDiv.style.color = '#34d399';
        addDiv.textContent = `+ ${nLine}`;
        diffPre.appendChild(addDiv);
      }
    }
  }

  modal.classList.remove('hidden');
}

function renderResponse(tab) {
  const metaContainer = document.getElementById('responseMeta');
  const bodyPre = document.getElementById('responseBodyPre');
  const headersGrid = document.getElementById('responseHeadersList');
  const cookiesGrid = document.getElementById('responseCookiesList');
  const badgeResHeaders = document.getElementById('badgeResHeaders');
  const badgeResCookies = document.getElementById('badgeResCookies');
  const badgeResTests = document.getElementById('badgeResTests');
  const testsList = document.getElementById('responseTestsList');

  renderRequestHistoryPane(tab);

  if (tab.loading) {
    metaContainer.innerHTML = `<span class="meta-pill meta-warn">Executando requisição...</span>`;
    bodyPre.textContent = 'Aguardando resposta do servidor...';
    headersGrid.innerHTML = '';
    cookiesGrid.innerHTML = '';
    badgeResHeaders.textContent = '';
    badgeResCookies.textContent = '';
    badgeResTests.textContent = '';
    return;
  }

  const res = tab.response;
  if (!res) {
    metaContainer.innerHTML = `<span class="meta-placeholder">Envie uma requisição para inspecionar a resposta</span>`;
    bodyPre.textContent = 'Aguardando envio da requisição...';
    headersGrid.innerHTML = '';
    cookiesGrid.innerHTML = '';
    badgeResHeaders.textContent = '';
    badgeResCookies.textContent = '';
    badgeResTests.textContent = '';
    testsList.innerHTML = `<div class="empty-hint">Nenhuma assertion ou captura executada ainda.</div>`;
    return;
  }

  if (!res.ok && res.status === 0) {
    metaContainer.innerHTML = `<span class="meta-pill meta-err">Erro: ${res.statusText || 'Falha de Rede'}</span><span>${res.timeMs || 0} ms</span>`;
    bodyPre.textContent = res.error || 'Erro desconhecido ao executar a requisição.';
    headersGrid.innerHTML = '';
    cookiesGrid.innerHTML = '';
    badgeResHeaders.textContent = '';
    badgeResCookies.textContent = '';
    badgeResTests.textContent = '';
    return;
  }

  const statusClass = res.status >= 200 && res.status < 300 ? 'meta-ok' : res.status >= 400 ? 'meta-err' : 'meta-warn';
  metaContainer.innerHTML = `
    <span>Status: <strong class="meta-pill ${statusClass}">${res.status} ${res.statusText || ''}</strong></span>
    <span>Time: <strong class="meta-pill ${statusClass}">${res.timeMs} ms</strong></span>
    <span>Size: <strong class="meta-pill ${statusClass}">${formatBytes(res.sizeBytes)}</strong></span>
  `;

  // Body Pretty vs Raw + Filtro JSONPath / Busca Rápida
  const filterExpr = (state.responseJsonFilter || '').trim();
  if (state.responseViewMode === 'pretty') {
    try {
      const parsed = JSON.parse(res.body);
      if (filterExpr) {
        const sub = getByPath(parsed, filterExpr);
        bodyPre.textContent = sub !== undefined ? JSON.stringify(sub, null, 2) : `(Caminho "${filterExpr}" não encontrado no JSON)`;
      } else {
        bodyPre.textContent = JSON.stringify(parsed, null, 2);
      }
    } catch {
      bodyPre.textContent = res.body || '(Corpo vazio)';
    }
  } else {
    bodyPre.textContent = res.body || '(Corpo vazio)';
  }

  // Response Headers
  const headerEntries = Object.entries(res.headers || {});
  badgeResHeaders.textContent = headerEntries.length > 0 ? `(${headerEntries.length})` : '';
  headersGrid.innerHTML = '';
  headerEntries.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'res-header-row';
    const keyEl = document.createElement('div');
    keyEl.className = 'res-header-key';
    keyEl.textContent = k;
    const valEl = document.createElement('div');
    valEl.textContent = Array.isArray(v) ? v.join(', ') : String(v);
    row.appendChild(keyEl);
    row.appendChild(valEl);
    headersGrid.appendChild(row);
  });

  // Response Cookies
  const resCookies = Array.isArray(res.cookies) ? res.cookies : [];
  badgeResCookies.textContent = resCookies.length > 0 ? `(${resCookies.length})` : '';
  cookiesGrid.innerHTML = '';
  if (resCookies.length === 0) {
    cookiesGrid.innerHTML = `<div class="empty-hint">Nenhum cabeçalho Set-Cookie retornado nesta resposta.</div>`;
  } else {
    resCookies.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'res-header-row';
      row.innerHTML = `<div class="res-header-key">${c.name} (${c.domain})</div><div>${c.value}</div>`;
      cookiesGrid.appendChild(row);
    });
  }

  // Test Results & Variable Captures
  testsList.innerHTML = '';
  const tr = tab.testResults;
  if (!tr || (tr.assertions.length === 0 && tr.captures.length === 0)) {
    badgeResTests.textContent = '';
    badgeResTests.classList.remove('fail');
    testsList.innerHTML = `<div class="empty-hint">Nenhuma assertion ou captura configurada nesta requisição.</div>`;
  } else {
    const total = tr.assertions.length;
    const passed = tr.assertions.filter((a) => a.passed).length;
    badgeResTests.textContent = total > 0 ? `(${passed}/${total})` : `(${tr.captures.length})`;
    badgeResTests.classList.toggle('fail', passed < total);

    tr.assertions.forEach((a) => {
      const item = document.createElement('div');
      item.className = 'test-result-item';
      item.innerHTML = `
        <span class="${a.passed ? 'test-badge-pass' : 'test-badge-fail'}">${a.passed ? 'PASS' : 'FAIL'}</span>
        <span><strong>${a.source}</strong> ${a.operator} <code>${a.target}</code> (obtido: <code>${a.actual}</code>)</span>
      `;
      testsList.appendChild(item);
    });

    tr.captures.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'test-result-item';
      item.innerHTML = `
        <span class="test-badge-capture">VAR</span>
        <span><code>${c.source}</code> → <strong>{{${c.varName}}}</strong> = <code>${c.value}</code></span>
      `;
      testsList.appendChild(item);
    });
  }

  // Inspector (Request Sent + Console de Scripts)
  const inspectorPre = document.getElementById('responseInspectorPre');
  const consoleListEl = document.getElementById('scriptConsoleLogsList');
  const badgeResInspector = document.getElementById('badgeResInspector');
  const logs = Array.isArray(tab.scriptConsoleLogs) ? tab.scriptConsoleLogs : [];

  if (badgeResInspector) {
    badgeResInspector.textContent = logs.length > 0 ? `(${logs.length})` : '';
  }

  if (consoleListEl) {
    consoleListEl.innerHTML = '';
    if (logs.length === 0) {
      consoleListEl.innerHTML = `<div class="empty-hint">Nenhuma saída de <code>console.log()</code> registrada nos scripts desta requisição.</div>`;
    } else {
      logs.forEach((l) => {
        const item = document.createElement('div');
        item.className = 'test-result-item';
        const badgeCls = l.level === 'ERROR' ? 'test-badge-fail' : l.level === 'WARN' ? 'test-badge-capture' : 'test-badge-pass';
        item.innerHTML = `
          <span class="${badgeCls}">${l.level}</span>
          <span class="badge">${l.phase} • ${l.timestamp}</span>
          <code style="flex:1; word-break:break-all;">${l.message}</code>
        `;
        consoleListEl.appendChild(item);
      });
    }
  }

  if (inspectorPre) {
    const sent = res.requestSent || tab.lastSentInspector;
    if (sent) {
      inspectorPre.textContent = JSON.stringify(sent, null, 2);
    } else {
      inspectorPre.textContent = 'Metadados de envio disponíveis após execução da requisição.';
    }
  }
}

/* Renderização da Sidebar (Collections c/ Pastas, Runner e Duplicação) */
function renderSidebar() {
  const envSelect = document.getElementById('envSelect');
  envSelect.innerHTML = `<option value="">No Environment</option>`;
  state.environments.forEach((env) => {
    const meta = getEnvProfileMeta(env);
    const opt = document.createElement('option');
    opt.value = env.id;
    opt.textContent = meta.label ? `${meta.icon} [${meta.label}] ${env.name}` : `${meta.icon} ${env.name}`;
    if (env.id === state.settings.activeEnvironmentId) opt.selected = true;
    envSelect.appendChild(opt);
  });
  applyActiveEnvProfileContour();

  const filterTerm = (state.sidebarFilter || '').trim().toLowerCase();

  // Collections
  const colList = document.getElementById('collectionsList');
  colList.innerHTML = '';
  state.collections.forEach((col, colIdx) => {
    const filteredItems = (col.items || []).filter((it) => {
      if (!filterTerm) return true;
      return (
        (it.name || '').toLowerCase().includes(filterTerm) ||
        (it.folder || '').toLowerCase().includes(filterTerm) ||
        (it.url || '').toLowerCase().includes(filterTerm) ||
        (it.method || '').toLowerCase().includes(filterTerm)
      );
    });

    if (filterTerm && filteredItems.length === 0 && !(col.name || '').toLowerCase().includes(filterTerm)) {
      return;
    }

    const group = document.createElement('div');
    group.className = 'collection-group';

    const header = document.createElement('div');
    header.className = 'collection-header';
    const isCollapsed = !!state.collapsedCollections[col.id];

    // Nome da Collection (ou input inline quando está renomeando)
    if (state.renamingCollectionId === col.id) {
      const renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.className = 'inline-rename-input';
      renameInput.value = col.name || '';
      renameInput.addEventListener('click', (e) => e.stopPropagation());
      const finishRename = async (save) => {
        if (state.renamingCollectionId !== col.id) return;
        if (save && renameInput.value.trim()) {
          col.name = renameInput.value.trim();
          await persistStore('collections');
        }
        state.renamingCollectionId = null;
        renderSidebar();
      };
      renameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishRename(true);
        if (e.key === 'Escape') finishRename(false);
      });
      renameInput.addEventListener('blur', () => finishRename(true));
      header.appendChild(renameInput);
      setTimeout(() => {
        renameInput.focus();
        renameInput.select();
      }, 10);
    } else {
      const titleSpan = document.createElement('span');
      titleSpan.style.flex = '1';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.title = 'Clique para expandir/recolher • Duplo-clique para renomear';
      titleSpan.textContent = `${isCollapsed ? '📁' : '📂'} ${col.name} (${filteredItems.length})`;
      titleSpan.addEventListener('click', () => {
        state.collapsedCollections[col.id] = !state.collapsedCollections[col.id];
        renderSidebar();
      });
      titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        state.renamingCollectionId = col.id;
        renderSidebar();
      });
      header.appendChild(titleSpan);
    }

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'collection-header-actions';

    // Botão + Req (Criar nova request diretamente nesta Collection)
    const addReqBtn = document.createElement('button');
    addReqBtn.className = 'btn-add-req-inline';
    addReqBtn.textContent = '+ Req';
    addReqBtn.title = 'Criar nova Request nesta Collection';
    addReqBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.collapsedCollections[col.id] = false;
      if (!Array.isArray(col.items)) col.items = [];
      const newReqItem = {
        id: uid('req'),
        name: `Nova Request ${(col.items.length || 0) + 1}`,
        folder: '',
        method: 'GET',
        url: '{{base_url}}/posts',
        params: [],
        headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
        auth: {
          type: col.auth?.type && col.auth.type !== 'none' ? 'inherit' : 'none',
          token: '',
          username: '',
          password: '',
          keyName: '',
          keyValue: '',
          addTo: 'header'
        },
        body: { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] },
        assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }],
        captures: [],
        preRequestScript: '',
        postResponseScript: ''
      };
      col.items.push(newReqItem);
      await persistStore('collections');
      state.renamingRequestId = newReqItem.id;
      openRequestInTab(newReqItem, col.id);
    });

    // Botão Renomear Collection
    const renColBtn = document.createElement('button');
    renColBtn.className = 'tree-item-delete';
    renColBtn.textContent = '✏️';
    renColBtn.title = 'Renomear Collection';
    renColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.renamingCollectionId = col.id;
      renderSidebar();
    });

    const runColBtn = document.createElement('button');
    runColBtn.className = 'tree-item-delete';
    runColBtn.textContent = '▶';
    runColBtn.title = 'Executar Collection em Sequência (Collection Runner)';
    runColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      runCollectionSequentially(col);
    });

    const expOvoColBtn = document.createElement('button');
    expOvoColBtn.className = 'btn-add-req-inline';
    expOvoColBtn.textContent = '🥚 .ovo';
    expOvoColBtn.title = 'Exportar Collection no formato nativo .ovo (Carro do Ovo)';
    expOvoColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportCollectionAsOvo(col);
    });

    const expColBtn = document.createElement('button');
    expColBtn.className = 'tree-item-delete';
    expColBtn.textContent = '📤';
    expColBtn.title = 'Exportar como Postman Collection v2.1 (.json)';
    expColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportCollectionAsPostmanV21(col);
    });

    const delColBtn = document.createElement('button');
    delColBtn.className = 'tree-item-delete';
    delColBtn.textContent = '🗑';
    delColBtn.title = 'Excluir Collection';
    delColBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.collections.splice(colIdx, 1);
      await persistStore('collections');
      renderSidebar();
    });

    const cfgColBtn = document.createElement('button');
    cfgColBtn.className = 'tree-item-delete';
    cfgColBtn.textContent = '⚙';
    cfgColBtn.title = 'Configurar Pastas e Variáveis da Collection';
    cfgColBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCollectionConfigModal(col);
    });

    actionsWrap.appendChild(addReqBtn);
    actionsWrap.appendChild(expOvoColBtn);
    actionsWrap.appendChild(cfgColBtn);
    actionsWrap.appendChild(renColBtn);
    actionsWrap.appendChild(runColBtn);
    actionsWrap.appendChild(expColBtn);
    actionsWrap.appendChild(delColBtn);
    header.appendChild(actionsWrap);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = `collection-items ${isCollapsed ? 'hidden' : ''}`;

    let lastFolder = null;
    filteredItems.forEach((item) => {
      if (!item.id) item.id = uid('req');
      const folderName = (item.folder || '').trim();
      if (folderName && folderName !== lastFolder) {
        lastFolder = folderName;
        const fLabel = document.createElement('div');
        fLabel.className = 'folder-label';
        fLabel.textContent = `📁 ${folderName}`;
        itemsWrap.appendChild(fLabel);
      }

      const realIdx = col.items.indexOf(item);
      const row = document.createElement('div');
      row.className = 'tree-item';
      row.addEventListener('click', () => {
        openRequestInTab(item, col.id);
      });

      const badge = document.createElement('span');
      badge.className = `method-badge method-${item.method || 'GET'}`;
      badge.textContent = item.method || 'GET';
      row.appendChild(badge);

      if (state.renamingRequestId === item.id) {
        const reqRenameInput = document.createElement('input');
        reqRenameInput.type = 'text';
        reqRenameInput.className = 'inline-rename-input';
        reqRenameInput.value = item.name || item.url || '';
        reqRenameInput.addEventListener('click', (e) => e.stopPropagation());
        const finishReqRename = async (save) => {
          if (state.renamingRequestId !== item.id) return;
          if (save && reqRenameInput.value.trim()) {
            item.name = reqRenameInput.value.trim();
            // Sincroniza também na aba aberta se for a mesma request
            const linkedTab = state.tabs.find((t) => t.collectionItemId === item.id);
            if (linkedTab) linkedTab.name = item.name;
            await persistStore('collections');
          }
          state.renamingRequestId = null;
          renderAll();
        };
        reqRenameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finishReqRename(true);
          if (e.key === 'Escape') finishReqRename(false);
        });
        reqRenameInput.addEventListener('blur', () => finishReqRename(true));
        row.appendChild(reqRenameInput);
        setTimeout(() => {
          reqRenameInput.focus();
          reqRenameInput.select();
        }, 10);
      } else {
        const name = document.createElement('span');
        name.className = 'tree-item-title';
        name.title = 'Clique para abrir • Duplo-clique para renomear';
        const reqHistCount = Array.isArray(item.history) && item.history.length > 0 ? ` (${item.history.length})` : '';
        name.textContent = `${item.name || item.url}${reqHistCount}`;
        name.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          state.renamingRequestId = item.id;
          renderSidebar();
        });
        row.appendChild(name);
      }

      const expReqOvoBtn = document.createElement('button');
      expReqOvoBtn.className = 'tree-item-delete';
      expReqOvoBtn.textContent = '🥚';
      expReqOvoBtn.title = 'Exportar esta Requisição como .ovo';
      expReqOvoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportRequestAsOvo(item);
      });

      const renReqBtn = document.createElement('button');
      renReqBtn.className = 'tree-item-delete';
      renReqBtn.textContent = '✏️';
      renReqBtn.title = 'Renomear Requisição';
      renReqBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.renamingRequestId = item.id;
        renderSidebar();
      });

      const dupBtn = document.createElement('button');
      dupBtn.className = 'tree-item-delete';
      dupBtn.textContent = '⧉';
      dupBtn.title = 'Duplicar Requisição';
      dupBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const copy = structuredClone(item);
        copy.id = uid('req');
        copy.name = `${item.name || 'Req'} (Cópia)`;
        col.items.splice(realIdx + 1, 0, copy);
        await persistStore('collections');
        renderSidebar();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'tree-item-delete';
      delBtn.textContent = '✕';
      delBtn.title = 'Remover da Collection';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (realIdx !== -1) col.items.splice(realIdx, 1);
        await persistStore('collections');
        renderSidebar();
      });

      row.appendChild(expReqOvoBtn);
      row.appendChild(renReqBtn);
      row.appendChild(dupBtn);
      row.appendChild(delBtn);
      itemsWrap.appendChild(row);
    });

    group.appendChild(header);
    group.appendChild(itemsWrap);
    colList.appendChild(group);
  });

  // Environments List na Sidebar
  const envList = document.getElementById('environmentsList');
  envList.innerHTML = '';
  state.environments.forEach((env) => {
    const meta = getEnvProfileMeta(env);
    const row = document.createElement('div');
    row.className = 'tree-item';
    if (meta.hasContour && meta.borderColor) {
      row.style.borderLeft = `3px solid ${meta.borderColor}`;
    }
    row.addEventListener('click', () => {
      state.settings.activeEnvironmentId = env.id;
      persistStore('settings');
      renderAll();
      openEnvModal(env.id);
    });

    const icon = document.createElement('span');
    icon.textContent = env.id === state.settings.activeEnvironmentId ? meta.icon : '⚪';
    row.appendChild(icon);

    if (meta.label) {
      const pill = document.createElement('span');
      pill.className = 'env-tree-profile-pill';
      pill.textContent = meta.label;
      if (meta.hasContour && meta.borderColor) {
        pill.style.borderColor = meta.borderColor;
        pill.style.color = meta.borderColor;
      }
      row.appendChild(pill);
    }

    const name = document.createElement('span');
    name.className = 'tree-item-title';
    name.textContent = `${env.name} (${(env.variables || []).length} vars)`;

    row.appendChild(name);
    envList.appendChild(row);
  });

  // History List na Sidebar (se presente)
  const histList = document.getElementById('historyList');
  const histBanner = document.getElementById('sidebarHistoryReqTitle');
  if (histList) {
    histList.innerHTML = '';
    const activeTab = getActiveTab();
    const reqHistory = Array.isArray(activeTab?.history) ? activeTab.history : [];

    if (histBanner) {
      histBanner.textContent = activeTab
        ? `📌 ${activeTab.name || activeTab.url || 'Sem título'} (${reqHistory.length} execuções)`
        : 'Nenhuma requisição selecionada';
    }

    if (reqHistory.length === 0) {
      histList.innerHTML = `<div class="empty-hint">Sem execuções registradas para esta requisição ainda.</div>`;
    } else {
      reqHistory.forEach((h, hIdx) => {
        const row = document.createElement('div');
        row.className = 'tree-item';
        row.title = 'Clique para carregar esta execução (resposta e parâmetros) na requisição ativa';
        row.addEventListener('click', async () => {
          if (!activeTab) return;
          if (h.response) activeTab.response = structuredClone(h.response);
          if (h.testResults) activeTab.testResults = structuredClone(h.testResults);
          if (h.requestSent) activeTab.lastSentInspector = structuredClone(h.requestSent);
          renderAll();
          document.getElementById('statusMessage').textContent = `Carregada execução de ${formatHistoryTimestamp(h.timestamp)} (${h.status}).`;
        });

        const isOk = h.status >= 200 && h.status < 300;
        const statusBadge = document.createElement('span');
        statusBadge.className = isOk ? 'test-badge-pass' : 'test-badge-fail';
        statusBadge.textContent = h.status || 'ERR';

        const name = document.createElement('span');
        name.className = 'tree-item-title';
        name.textContent = `${formatHistoryTimestamp(h.timestamp)} • ${h.timeMs || 0}ms`;

        const delBtn = document.createElement('button');
        delBtn.className = 'tree-item-delete';
        delBtn.textContent = '✕';
        delBtn.title = 'Remover do histórico desta requisição';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          activeTab.history.splice(hIdx, 1);
          await syncTabBackToCollectionItem(activeTab);
          await saveSessionState();
          renderAll();
        });

        row.appendChild(statusBadge);
        row.appendChild(name);
        row.appendChild(delBtn);
        histList.appendChild(row);
      });
    }
  }
}

function openRequestInTab(item, collectionId = null) {
  // Se já houver uma aba aberta para este item da Collection, foca nela
  if (item.id && collectionId) {
    const existingTab = state.tabs.find((t) => t.collectionItemId === item.id && t.collectionId === collectionId);
    if (existingTab) {
      state.activeTabId = existingTab.id;
      renderAll();
      return;
    }
  }

  const newTab = createBlankTab({
    collectionId,
    collectionItemId: item.id || null,
    name: item.name || item.url,
    folder: item.folder || '',
    method: item.method || 'GET',
    url: item.url || '',
    params: item.params || [],
    headers: item.headers || [],
    auth: item.auth || { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' },
    body: item.body || { mode: 'none', raw: '', graphqlQuery: '', graphqlVars: '{\n  \n}', urlencoded: [], formdata: [] },
    assertions: item.assertions || [{ source: 'status', operator: '==', target: '200', enabled: true }],
    captures: item.captures || [],
    preRequestScript: item.preRequestScript || '',
    postResponseScript: item.postResponseScript || '',
    history: Array.isArray(item.history) ? item.history : [],
    response: item.history?.[0]?.response || null,
    testResults: item.history?.[0]?.testResults || null
  });
  state.tabs.push(newTab);
  state.activeTabId = newTab.id;
  saveSessionState();
  renderAll();
}

async function syncTabBackToCollectionItem(tab) {
  if (!tab || !tab.collectionId || !tab.collectionItemId) return;
  const col = state.collections.find((c) => c.id === tab.collectionId);
  if (!col || !Array.isArray(col.items)) return;
  const item = col.items.find((it) => it.id === tab.collectionItemId);
  if (!item) return;

  item.name = tab.name;
  item.method = tab.method;
  item.url = tab.url;
  item.params = structuredClone(tab.params);
  item.headers = structuredClone(tab.headers);
  item.auth = structuredClone(tab.auth);
  item.body = structuredClone(tab.body);
  item.assertions = structuredClone(tab.assertions);
  item.captures = structuredClone(tab.captures);
  item.preRequestScript = tab.preRequestScript || '';
  item.postResponseScript = tab.postResponseScript || '';
  item.history = Array.isArray(tab.history) ? structuredClone(tab.history) : [];
  await persistStore('collections');
}

/* Execução de uma Requisição (usada tanto pelo botão Send quanto pelo Collection Runner) */
async function executeTabRequestObject(tab) {
  const latestStore = await IPC.invoke('pm:storage:loadAll');
  if (latestStore.environments) state.environments = latestStore.environments;
  if (latestStore.cookies) state.cookies = latestStore.cookies;
  if (latestStore.sessions?.responseCache) {
    state.sessions.responseCache = {
      ...latestStore.sessions.responseCache,
      ...(state.sessions.responseCache || {})
    };
  }

  // 1. Executa Pre-request Script (pm.*) antes de interpolar variáveis
  await executePreRequestScript(tab);

  const resolvedUrl = interpolateVariables(tab.url || '');
  const resolvedHeaders = (tab.headers || []).map((h) => ({
    key: interpolateVariables(h.key || ''),
    value: interpolateVariables(h.value || ''),
    enabled: h.enabled !== false
  }));
  const effectiveAuth = resolveEffectiveTabAuth(tab);
  const resolvedAuth = {
    type: effectiveAuth?.type || 'none',
    inheritedFromCollection: effectiveAuth?.inheritedFromCollection || undefined,
    token: interpolateVariables(effectiveAuth?.token || ''),
    username: interpolateVariables(effectiveAuth?.username || ''),
    password: interpolateVariables(effectiveAuth?.password || ''),
    keyName: interpolateVariables(effectiveAuth?.keyName || ''),
    keyValue: interpolateVariables(effectiveAuth?.keyValue || ''),
    addTo: effectiveAuth?.addTo || 'header'
  };

  let effectiveBodyMode = tab.body?.mode || 'none';
  let effectiveRaw = interpolateVariables(tab.body?.raw || '');
  if (effectiveBodyMode === 'graphql') {
    const gqlQuery = interpolateVariables(tab.body?.graphqlQuery || '');
    const gqlVarsRaw = interpolateVariables(tab.body?.graphqlVars || '{}');
    let parsedVars = {};
    try {
      parsedVars = JSON.parse(gqlVarsRaw);
    } catch {
      parsedVars = gqlVarsRaw;
    }
    effectiveBodyMode = 'json';
    effectiveRaw = JSON.stringify({ query: gqlQuery, variables: parsedVars }, null, 2);
  }

  const resolvedBody = {
    mode: effectiveBodyMode,
    raw: effectiveRaw,
    urlencoded: (tab.body?.urlencoded || []).map((u) => ({
      key: interpolateVariables(u.key || ''),
      value: interpolateVariables(u.value || ''),
      enabled: u.enabled !== false
    })),
    formdata: (tab.body?.formdata || []).map((f) => ({
      ...f,
      key: interpolateVariables(f.key || ''),
      value: interpolateVariables(f.value || '')
    }))
  };

  const netSettings = ensureNetworkSettings();
  const resolvedNetwork = {
    ignoreCertErrors: Boolean(netSettings.ignoreCertErrors),
    proxy: {
      enabled: Boolean(netSettings.proxy?.enabled),
      protocol: netSettings.proxy?.protocol || 'http',
      host: interpolateVariables(netSettings.proxy?.host || ''),
      port: interpolateVariables(String(netSettings.proxy?.port || '8080')),
      username: interpolateVariables(netSettings.proxy?.username || ''),
      password: interpolateVariables(netSettings.proxy?.password || ''),
      bypass: interpolateVariables(netSettings.proxy?.bypass || 'localhost, 127.0.0.1, ::1')
    },
    mtls: {
      enabled: Boolean(netSettings.mtls?.enabled),
      fileName: netSettings.mtls?.fileName || '',
      certBase64: netSettings.mtls?.certBase64 || '',
      passphrase: interpolateVariables(netSettings.mtls?.passphrase || '')
    }
  };

  tab.lastSentInspector = {
    timestamp: new Date().toISOString(),
    method: tab.method,
    resolvedUrl,
    network: {
      ignoreCertErrors: resolvedNetwork.ignoreCertErrors,
      proxy: resolvedNetwork.proxy.enabled && resolvedNetwork.proxy.host
        ? `${resolvedNetwork.proxy.protocol}://${resolvedNetwork.proxy.host}:${resolvedNetwork.proxy.port}`
        : 'direct'
    },
    resolvedHeaders: resolvedHeaders.filter((h) => h.enabled !== false && h.key),
    resolvedAuth: resolvedAuth.type !== 'none' ? resolvedAuth : undefined,
    resolvedBody: effectiveBodyMode !== 'none' ? resolvedBody : undefined
  };

  const response = await IPC.invoke('pm:runtime:request', {
    method: tab.method,
    url: resolvedUrl,
    headers: resolvedHeaders,
    auth: resolvedAuth,
    body: resolvedBody,
    timeoutMs: Number(state.settings.timeoutMs) || 30000,
    network: resolvedNetwork
  });

  tab.response = response;

  if (response.ok) {
    if (!state.sessions.responseCache) state.sessions.responseCache = {};
    const reqKey = (tab.name || tab.url || tab.id).trim();
    const cacheEntry = {
      name: reqKey,
      method: tab.method,
      url: tab.url,
      timestamp: new Date().toISOString(),
      response
    };
    state.sessions.responseCache[reqKey] = cacheEntry;
    state.sessions.responseCache.__last = cacheEntry;

    if (Array.isArray(response.cookies) && response.cookies.length > 0) {
      const fresh = await IPC.invoke('pm:storage:loadAll');
      if (fresh.cookies) state.cookies = fresh.cookies;
    }

    await evaluateAssertionsAndCaptures(tab, response);
  }

  // Registra no Histórico Individual desta Requisição
  if (!Array.isArray(tab.history)) tab.history = [];
  tab.history.unshift({
    id: uid('hist'),
    timestamp: new Date().toISOString(),
    name: tab.name || tab.url,
    method: tab.method,
    url: tab.url,
    resolvedUrl,
    status: response.status,
    statusText: response.statusText || '',
    timeMs: response.timeMs || 0,
    sizeBytes: response.sizeBytes || 0,
    params: structuredClone(tab.params || []),
    headers: structuredClone(tab.headers || []),
    auth: structuredClone(tab.auth || {}),
    body: structuredClone(tab.body || {}),
    response: structuredClone(response),
    testResults: tab.testResults ? structuredClone(tab.testResults) : null,
    requestSent: tab.lastSentInspector ? structuredClone(tab.lastSentInspector) : null
  });
  if (tab.history.length > 30) tab.history.length = 30;

  await syncTabBackToCollectionItem(tab);
  await saveSessionState();

  return response;
}

async function sendActiveRequest() {
  const tab = getActiveTab();
  if (!tab || tab.loading) return;

  const method = (tab.method || 'GET').toUpperCase();
  const env = getActiveEnvironment();
  if (isActiveProfileConfirmDestructive(env) && ['DELETE', 'PUT', 'PATCH', 'POST'].includes(method)) {
    const meta = getEnvProfileMeta(env);
    const ctxName = meta.label ? `Profile "${meta.label}" (${env.name})` : `Environment "${env.name}"`;
    const resolvedUrl = interpolateVariables(tab.url || '');
    const confirmed = window.confirm(
      `🛡️ Trava Anti-Acidente Ativa em ${ctxName}\n\nDeseja realmente enviar a requisição ${method} para:\n${resolvedUrl} ?`
    );
    if (!confirmed) {
      document.getElementById('statusMessage').textContent = `Envio de ${method} cancelado pela trava de segurança do Profile.`;
      return;
    }
  }

  tab.loading = true;
  renderActiveRequest();

  const statusMsg = document.getElementById('statusMessage');
  statusMsg.textContent = `Enviando ${tab.method} ${interpolateVariables(tab.url || '')}...`;

  const response = await executeTabRequestObject(tab);
  tab.loading = false;

  statusMsg.textContent = response.ok
    ? `Concluído: ${response.status} ${response.statusText} (${response.timeMs} ms) — Salvo no histórico individual da requisição`
    : `Erro: ${response.error || response.statusText}`;

  renderAll();
}

/* ============================================================================
 * US-11 & US-23: Collection Runner (Execução em Lote + Data File .json/.csv)
 * ============================================================================ */
let activeRunnerCollectionId = null;
let runnerDatasetRows = [];

function parseRunnerCsvData(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = vals[i] ?? '';
    });
    return obj;
  });
}

async function runCollectionSequentially(col) {
  const items = col?.items || [];
  if (items.length === 0) return;
  activeRunnerCollectionId = col.id;

  document.getElementById('runnerModalTitle').textContent = `▶ Collection Runner — ${col.name}`;
  const summaryBar = document.getElementById('runnerSummaryBar');
  const resultsList = document.getElementById('runnerResultsList');
  const iterations = runnerDatasetRows.length > 0 ? runnerDatasetRows : [null];

  summaryBar.textContent = `Executando ${items.length} requisições × ${iterations.length} iteração(ões)...`;
  resultsList.innerHTML = '';
  document.getElementById('runnerModal').classList.remove('hidden');

  let passedReqs = 0;
  let totalExecs = 0;
  let totalTime = 0;

  for (let iterIdx = 0; iterIdx < iterations.length; iterIdx++) {
    const rowData = iterations[iterIdx];
    state.runnerIterationVars = rowData || null;

    for (const item of items) {
      totalExecs++;
      const tempTab = createBlankTab({ ...item, collectionId: col.id });
      const res = await executeTabRequestObject(tempTab);
      totalTime += res.timeMs || 0;

      const assertions = tempTab.testResults?.assertions || [];
      const captures = tempTab.testResults?.captures || [];
      const allPassed = res.ok && assertions.every((a) => a.passed);
      if (allPassed) passedReqs++;

      const row = document.createElement('div');
      row.className = 'test-result-item';
      const iterBadge = iterations.length > 1 ? `<span class="badge" style="margin-right:4px;">#${iterIdx + 1}</span>` : '';
      const capturesText = captures.length > 0 ? ` | Capturas: ${captures.map((c) => `{{${c.varName}}}=${c.value}`).join(', ')}` : '';
      row.innerHTML = `
        ${iterBadge}
        <span class="${allPassed ? 'test-badge-pass' : 'test-badge-fail'}">${allPassed ? 'PASS' : 'FAIL'}</span>
        <span class="method-badge method-${tempTab.method}">${tempTab.method}</span>
        <span style="flex:1;"><strong>${tempTab.name}</strong> — Status ${res.status} (${res.timeMs} ms)${capturesText}</span>
      `;
      resultsList.appendChild(row);
    }
  }

  state.runnerIterationVars = null;
  summaryBar.textContent = `Concluído: ${passedReqs}/${totalExecs} execuções aprovadas (${iterations.length} iteração(ões)) • Tempo total: ${totalTime} ms`;
  renderAll();
}

/* Modal de Environment (+ Profiles, Contorno da Requisição e .env Import/Export) */
let editingEnvId = null;

function syncEnvModalProfileControls(env) {
  if (!env) return;
  ensureEnvProfileStructure(env);
  const meta = getEnvProfileMeta(env);

  const profSelect = document.getElementById('envModalProfileSelect');
  const delProfBtn = document.getElementById('btnDeleteCustomEnvProfile');
  const contourSelect = document.getElementById('envModalContourModeSelect');
  const colorInput = document.getElementById('envModalBorderColorInput');
  const previewBanner = document.getElementById('envProfilePreviewBanner');
  const varsHeader = document.getElementById('envVarsPaneHeaderTitle');

  if (profSelect) {
    profSelect.innerHTML = `<option value="">Sem Profile (Base do Environment)</option>`;
    (env.customProfiles || []).forEach((cp) => {
      const opt = document.createElement('option');
      opt.value = cp.id;
      opt.textContent = `${cp.borderColor ? '🎨' : '🏷️'} ${cp.name}${cp.borderColor ? ` (${cp.borderColor})` : ' (Sem contorno)'}`;
      profSelect.appendChild(opt);
    });
    profSelect.value = meta.profileKey || '';
  }

  if (delProfBtn) {
    delProfBtn.classList.toggle('hidden', !meta.profileKey);
  }

  const c = (meta.borderColor || '').toLowerCase();
  if (contourSelect) {
    contourSelect.value = c ? 'custom' : 'none';
  }

  if (colorInput) {
    colorInput.value = c || '#ef4444';
    colorInput.classList.toggle('hidden', !c);
  }

  const chkDestructive = document.getElementById('envConfirmDestructiveCheckbox');
  if (chkDestructive) {
    chkDestructive.checked = isActiveProfileConfirmDestructive(env);
  }

  const activeContextLabel = meta.label ? `Profile "${meta.label}"` : `Environment "${env.name}" (Sem Profile)`;

  if (previewBanner) {
    if (c) {
      previewBanner.style.borderColor = c;
      previewBanner.style.boxShadow = `0 0 12px -2px ${c}`;
      previewBanner.style.color = 'var(--text-primary)';
      previewBanner.textContent = `${meta.icon} ${activeContextLabel} — A requisição ficará contornada com a cor ${c.toUpperCase()}`;
    } else {
      previewBanner.style.borderColor = 'var(--border-color)';
      previewBanner.style.boxShadow = 'none';
      previewBanner.style.color = 'var(--text-secondary)';
      previewBanner.textContent = `${meta.icon} ${activeContextLabel} — Sem contorno customizado na requisição`;
    }
  }

  if (varsHeader) {
    varsHeader.textContent = meta.label
      ? `Variáveis do Profile [${meta.label}] em "${env.name}" (marque 🔒 Secret para ocultar valores sensíveis)`
      : `Variáveis de "${env.name}" (marque 🔒 Secret para ocultar valores sensíveis)`;
  }
}

function openEnvModal(envId) {
  let env = state.environments.find((e) => e.id === envId);
  if (!env) {
    env = {
      id: uid('env'),
      name: 'Novo Environment',
      profile: '',
      borderColor: '',
      customProfiles: [],
      profileVariables: {},
      variables: [{ key: 'base_url', value: 'https://jsonplaceholder.typicode.com', enabled: true, secret: false }]
    };
    state.environments.push(env);
    state.settings.activeEnvironmentId = env.id;
  }
  ensureEnvProfileStructure(env);
  editingEnvId = env.id;
  document.getElementById('envNameInput').value = env.name;
  const newProfInput = document.getElementById('envNewProfileNameInput');
  if (newProfInput) newProfInput.value = '';
  syncEnvModalProfileControls(env);
  renderEnvVarsTable(env.variables);
  document.getElementById('envModal').classList.remove('hidden');
}

/* Cookie Jar Modal */
function renderCookieJarModal() {
  const container = document.getElementById('cookieJarTable');
  container.innerHTML = '';

  if (!Array.isArray(state.cookies) || state.cookies.length === 0) {
    container.innerHTML = `<div class="empty-hint">Nenhum cookie armazenado no Cookie Jar local.</div>`;
    return;
  }

  state.cookies.forEach((c, idx) => {
    const row = document.createElement('div');
    row.className = 'cookie-row';

    const domInput = document.createElement('input');
    domInput.type = 'text';
    domInput.className = 'kv-input';
    domInput.placeholder = 'Domínio (ex: localhost)';
    domInput.value = c.domain || '';
    domInput.addEventListener('input', () => (c.domain = domInput.value.toLowerCase()));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'kv-input';
    nameInput.placeholder = 'Nome do Cookie';
    nameInput.value = c.name || '';
    nameInput.addEventListener('input', () => (c.name = nameInput.value));

    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'kv-input';
    valInput.placeholder = 'Valor';
    valInput.value = c.value || '';
    valInput.addEventListener('input', () => (c.value = valInput.value));

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.className = 'kv-input';
    pathInput.placeholder = 'Path (/)';
    pathInput.value = c.path || '/';
    pathInput.addEventListener('input', () => (c.path = pathInput.value));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      state.cookies.splice(idx, 1);
      renderCookieJarModal();
    });

    row.appendChild(domInput);
    row.appendChild(nameInput);
    row.appendChild(valInput);
    row.appendChild(pathInput);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}

function ensureNetworkSettings() {
  if (!state.settings || typeof state.settings !== 'object') {
    state.settings = { theme: 'dark', activeEnvironmentId: '' };
  }
  if (state.settings.ignoreCertErrors === undefined) {
    state.settings.ignoreCertErrors = true;
  }
  if (!state.settings.timeoutMs) {
    state.settings.timeoutMs = 30000;
  }
  if (!state.settings.proxy || typeof state.settings.proxy !== 'object') {
    state.settings.proxy = {
      enabled: false,
      protocol: 'http',
      host: '',
      port: '8080',
      username: '',
      password: '',
      bypass: 'localhost, 127.0.0.1, ::1'
    };
  }
  if (!state.settings.mtls || typeof state.settings.mtls !== 'object') {
    state.settings.mtls = {
      enabled: false,
      fileName: '',
      certBase64: '',
      passphrase: ''
    };
  }
  return state.settings;
}

function renderNetworkStatusIndicators() {
  const net = ensureNetworkSettings();
  const topBtn = document.getElementById('btnOpenNetworkModal');
  const statusEl = document.getElementById('statusNetworkSummary');
  const proxyActive = Boolean(net.proxy?.enabled && String(net.proxy?.host || '').trim());
  const mtlsActive = Boolean(net.mtls?.enabled && net.mtls?.certBase64);
  const sslLabel = net.ignoreCertErrors ? '🔓 SSL Ignorado' : '🔒 SSL Estrito';
  const mtlsLabel = mtlsActive ? ` • 🪪 mTLS (${net.mtls.fileName})` : '';
  const proxyLabel = proxyActive ? `🌐 Proxy ${net.proxy.host}:${net.proxy.port || 8080}` : 'Sem Proxy';

  if (topBtn) {
    topBtn.textContent = proxyActive ? '⚙ Configurações (🌐 Proxy)' : '⚙ Configurações';
    topBtn.style.borderColor = proxyActive || mtlsActive ? 'var(--accent)' : '';
    topBtn.title = `Configurações • ${sslLabel}${mtlsLabel} • ${proxyLabel}`;
  }
  if (statusEl) {
    statusEl.textContent = `${sslLabel}${mtlsLabel} • ${proxyLabel}`;
  }
}

function openNetworkModal() {
  const net = ensureNetworkSettings();
  const chkCert = document.getElementById('netIgnoreCertErrorsCheckbox');
  const timeoutIn = document.getElementById('netTimeoutMsInput');
  const chkMtls = document.getElementById('netMtlsEnabledCheckbox');
  const mtlsName = document.getElementById('netMtlsCertFileName');
  const mtlsPass = document.getElementById('netMtlsPassphraseInput');
  const chkProxy = document.getElementById('netProxyEnabledCheckbox');
  const protoSel = document.getElementById('netProxyProtocolSelect');
  const hostIn = document.getElementById('netProxyHostInput');
  const portIn = document.getElementById('netProxyPortInput');
  const userIn = document.getElementById('netProxyUsernameInput');
  const passIn = document.getElementById('netProxyPasswordInput');
  const bypassIn = document.getElementById('netProxyBypassInput');
  const fieldsBox = document.getElementById('netProxyFieldsContainer');

  if (chkCert) chkCert.checked = Boolean(net.ignoreCertErrors);
  if (timeoutIn) timeoutIn.value = Number(net.timeoutMs) || 30000;
  if (chkMtls) chkMtls.checked = Boolean(net.mtls?.enabled);
  if (mtlsName) mtlsName.textContent = net.mtls?.fileName || 'Nenhum certificado carregado';
  if (mtlsPass) mtlsPass.value = net.mtls?.passphrase || '';
  if (chkProxy) chkProxy.checked = Boolean(net.proxy?.enabled);
  if (protoSel) protoSel.value = net.proxy?.protocol || 'http';
  if (hostIn) hostIn.value = net.proxy?.host || '';
  if (portIn) portIn.value = net.proxy?.port || '8080';
  if (userIn) userIn.value = net.proxy?.username || '';
  if (passIn) passIn.value = net.proxy?.password || '';
  if (bypassIn) bypassIn.value = net.proxy?.bypass ?? 'localhost, 127.0.0.1, ::1';
  if (fieldsBox) {
    fieldsBox.style.opacity = chkProxy?.checked ? '1' : '0.55';
  }

  document.getElementById('networkModal')?.classList.remove('hidden');
}

let editingCollectionConfigId = null;

function syncCollectionConfigAuthFields(authType) {
  document.getElementById('colAuthBearerFields')?.classList.toggle('hidden', authType !== 'bearer');
  document.getElementById('colAuthBasicFields')?.classList.toggle('hidden', authType !== 'basic');
  document.getElementById('colAuthApiKeyFields')?.classList.toggle('hidden', authType !== 'apikey');
}

function openCollectionConfigModal(col) {
  if (!col) return;
  editingCollectionConfigId = col.id;
  if (!Array.isArray(col.variables)) col.variables = [];
  if (!Array.isArray(col.items)) col.items = [];
  if (!col.auth || typeof col.auth !== 'object') {
    col.auth = { type: 'none', token: '', username: '', password: '', keyName: 'X-API-Key', keyValue: '', addTo: 'header' };
  }

  document.getElementById('collectionConfigModalTitle').textContent = `📁 Configurar Collection — ${col.name}`;

  const colAuthType = col.auth.type || 'none';
  const selType = document.getElementById('colAuthTypeSelect');
  if (selType) selType.value = colAuthType;
  syncCollectionConfigAuthFields(colAuthType);

  const bearerIn = document.getElementById('colAuthBearerTokenInput');
  const basicUserIn = document.getElementById('colAuthBasicUserInput');
  const basicPassIn = document.getElementById('colAuthBasicPassInput');
  const apiKeyNameIn = document.getElementById('colAuthApiKeyNameInput');
  const apiKeyValIn = document.getElementById('colAuthApiKeyValueInput');
  const apiKeyAddToSel = document.getElementById('colAuthApiKeyAddToSelect');

  if (bearerIn) bearerIn.value = col.auth.token || '';
  if (basicUserIn) basicUserIn.value = col.auth.username || '';
  if (basicPassIn) basicPassIn.value = col.auth.password || '';
  if (apiKeyNameIn) apiKeyNameIn.value = col.auth.keyName || 'X-API-Key';
  if (apiKeyValIn) apiKeyValIn.value = col.auth.keyValue || '';
  if (apiKeyAddToSel) apiKeyAddToSel.value = col.auth.addTo || 'header';

  const foldersContainer = document.getElementById('collectionFoldersTable');
  if (foldersContainer) {
    foldersContainer.innerHTML = '';
    if (col.items.length === 0) {
      foldersContainer.innerHTML = `<div class="empty-hint">Nenhuma requisição nesta Collection ainda.</div>`;
    } else {
      col.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'kv-row';
        row.style.gridTemplateColumns = '70px 1fr 1fr';
        const badge = document.createElement('span');
        badge.className = `method-badge method-${it.method || 'GET'}`;
        badge.textContent = it.method || 'GET';
        const nameEl = document.createElement('span');
        nameEl.style.fontSize = '12px';
        nameEl.style.overflow = 'hidden';
        nameEl.style.textOverflow = 'ellipsis';
        nameEl.style.whiteSpace = 'nowrap';
        nameEl.textContent = it.name || it.url;
        const folderIn = document.createElement('input');
        folderIn.type = 'text';
        folderIn.className = 'kv-input';
        folderIn.placeholder = 'Nome da Pasta (ex: Auth, Usuários)';
        folderIn.value = it.folder || '';
        folderIn.addEventListener('input', () => {
          it.folder = folderIn.value.trim();
        });
        row.appendChild(badge);
        row.appendChild(nameEl);
        row.appendChild(folderIn);
        foldersContainer.appendChild(row);
      });
    }
  }

  renderKeyValueTable('collectionVarsTable', col.variables, () => {}, {
    key: 'Variável da Collection (ex: service_prefix)',
    value: 'Valor (viaja no arquivo .ovo da Collection)'
  });

  document.getElementById('collectionConfigModal')?.classList.remove('hidden');
}

function getCommandPaletteActions(query = '') {
  const q = query.toLowerCase().trim();
  const actions = [];

  // 1. Todas as requisições de todas as Collections
  state.collections.forEach((col) => {
    (col.items || []).forEach((it) => {
      const folderPrefix = it.folder ? `${it.folder} / ` : '';
      actions.push({
        category: `Collection: ${col.name}`,
        label: `[${it.method || 'GET'}] ${folderPrefix}${it.name || it.url}`,
        sub: it.url || '',
        run: () => openRequestInTab(it, col.id)
      });
    });
  });

  // 2. Environments e Profiles criados pelo usuário
  state.environments.forEach((env) => {
    actions.push({
      category: 'Environment',
      label: `🌐 Ativar Environment: ${env.name} (Sem Profile)`,
      sub: `${(env.variables || []).length} variáveis`,
      run: async () => {
        state.settings.activeEnvironmentId = env.id;
        switchEnvironmentActiveProfile(env, '');
        await persistStore('environments');
        await persistStore('settings');
        renderAll();
      }
    });
    (env.customProfiles || []).forEach((cp) => {
      actions.push({
        category: `Profile (${env.name})`,
        label: `${cp.borderColor ? '🎨' : '🏷️'} Ativar Profile "${cp.name}" em ${env.name}`,
        sub: cp.borderColor ? `Contorno ${cp.borderColor}` : 'Sem contorno',
        run: async () => {
          state.settings.activeEnvironmentId = env.id;
          switchEnvironmentActiveProfile(env, cp.id);
          await persistStore('environments');
          await persistStore('settings');
          renderAll();
        }
      });
    });
  });

  // 3. Ações rápidas de Rede, Layout e Exportação .ovo
  actions.push(
    {
      category: 'Rede / Segurança',
      label: '🛡️ Configurar Proxy HTTP/HTTPS e Certificado SSL/TLS',
      sub: 'Abrir modal de Rede, Proxy e rejectUnauthorized',
      run: () => openNetworkModal()
    },
    {
      category: 'Exportação Nativa',
      label: '🥚 Exportar Requisição Ativa como arquivo .ovo',
      sub: 'Formato nativo Carro do Ovo',
      run: () => exportRequestAsOvo(getActiveTab())
    },
    {
      category: 'Disposição das Janelas',
      label: '⬌ Disposição Lado a Lado (Request à Esquerda / Response à Direita)',
      sub: 'Layout Horizontal',
      run: () => {
        state.settings.layout.splitDirection = 'horizontal';
        applyLayoutState(state.settings.layout);
        saveLayoutPrefs(state.settings.layout);
      }
    },
    {
      category: 'Disposição das Janelas',
      label: '⬍ Disposição Empilhada (Request em Cima / Response em Baixo)',
      sub: 'Layout Vertical',
      run: () => {
        state.settings.layout.splitDirection = 'vertical';
        applyLayoutState(state.settings.layout);
        saveLayoutPrefs(state.settings.layout);
      }
    },
    {
      category: 'Aparência',
      label: '☀ / 🌙 Alternar Tema Dark / Light',
      sub: 'Trocar esquema de cores',
      run: async () => {
        state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
        applyTheme(state.settings.theme);
        await persistStore('settings');
      }
    }
  );

  if (!q) return actions;
  return actions.filter(
    (a) =>
      a.label.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      (a.sub || '').toLowerCase().includes(q)
  );
}

function renderCommandPaletteList(query = '') {
  const listEl = document.getElementById('commandPaletteList');
  if (!listEl) return;
  listEl.innerHTML = '';
  const items = getCommandPaletteActions(query);
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-hint">Nenhum comando ou requisição encontrado para "${query}".</div>`;
    return;
  }
  items.slice(0, 30).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'test-result-item';
    row.style.cursor = 'pointer';
    row.style.justifyContent = 'space-between';
    row.innerHTML = `
      <div>
        <strong>${item.label}</strong>
        <span style="color:var(--text-secondary); font-size:11px; margin-left:8px;">${item.sub || ''}</span>
      </div>
      <span class="badge">${item.category}</span>
    `;
    row.addEventListener('click', () => {
      document.getElementById('commandPaletteModal')?.classList.add('hidden');
      item.run();
    });
    listEl.appendChild(row);
  });
}

function openCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('commandPaletteInput');
  if (!modal || !input) return;
  input.value = '';
  renderCommandPaletteList('');
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 20);
}

function renderAll() {
  renderSidebar();
  renderTabsBar();
  renderActiveRequest();
  applyActiveEnvProfileContour();
  renderNetworkStatusIndicators();
}

function getLayoutPrefs() {
  let savedLocal = null;
  try {
    savedLocal = JSON.parse(localStorage.getItem('carteiro_layout_prefs') || 'null');
  } catch {}
  const base = {
    sidebarWidth: 325,
    sidebarCollapsed: false,
    sidebarPosition: 'left', // 'left' (◧) ou 'right' (◨)
    splitDirection: 'vertical', // 'vertical' (⬍), 'vertical-reverse' (⬆), 'horizontal' (⬌), 'horizontal-reverse' (⬅)
    requestPanePct: 45,
    focusMode: 'none' // 'none', 'request', 'response'
  };
  return {
    ...base,
    ...(savedLocal || {}),
    ...(state.settings?.layout || {})
  };
}

async function saveLayoutPrefs(layout) {
  state.settings.layout = layout;
  try {
    localStorage.setItem('carteiro_layout_prefs', JSON.stringify(layout));
  } catch {}
  await persistStore('settings');
}

function applyLayoutState(layout) {
  const workspace = document.getElementById('workspaceContainer');
  const sidebar = document.getElementById('appSidebar');
  const splitContainer = document.getElementById('workbenchSplitContainer');
  const reqPane = document.getElementById('requestEditorPane');
  const btnSidebar = document.getElementById('btnToggleSidebar');
  const btnSplit = document.getElementById('btnToggleSplitLayout');

  if (workspace) {
    workspace.classList.toggle('sidebar-right', layout.sidebarPosition === 'right');
  }

  if (sidebar) {
    if (layout.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      if (btnSidebar) btnSidebar.textContent = '⬜ Menu';
    } else {
      sidebar.classList.remove('collapsed');
      const w = Math.max(180, Math.min(680, Number(layout.sidebarWidth) || 325));
      sidebar.style.width = `${w}px`;
      if (btnSidebar) btnSidebar.textContent = layout.sidebarPosition === 'right' ? '◨ Menu' : '◧ Menu';
    }
  }

  if (splitContainer && reqPane) {
    const pct = Math.max(18, Math.min(82, Number(layout.requestPanePct) || 45));
    const dir = layout.splitDirection || 'vertical';
    splitContainer.classList.remove('split-vertical-reverse', 'split-horizontal', 'split-horizontal-reverse', 'focus-request', 'focus-response');

    if (layout.focusMode === 'request') {
      splitContainer.classList.add('focus-request');
    } else if (layout.focusMode === 'response') {
      splitContainer.classList.add('focus-response');
    }

    if (dir === 'horizontal' || dir === 'horizontal-reverse') {
      splitContainer.classList.add(dir === 'horizontal-reverse' ? 'split-horizontal-reverse' : 'split-horizontal');
      reqPane.style.width = `${pct}%`;
      reqPane.style.height = '100%';
      if (btnSplit) btnSplit.textContent = dir === 'horizontal-reverse' ? '⬅ Layout' : '⬌ Layout';
    } else {
      if (dir === 'vertical-reverse') {
        splitContainer.classList.add('split-vertical-reverse');
      }
      reqPane.style.height = `${pct}%`;
      reqPane.style.width = '100%';
      if (btnSplit) btnSplit.textContent = dir === 'vertical-reverse' ? '⬆ Layout' : '⬍ Layout';
    }
  }

  // Atualiza destaque visual no menu de Disposição
  document.querySelectorAll('[data-disp-sidebar]').forEach((b) => {
    const val = b.dataset.dispSidebar;
    if (val === 'toggle') {
      b.classList.toggle('active-disp', !!layout.sidebarCollapsed);
    } else {
      b.classList.toggle('active-disp', !layout.sidebarCollapsed && (layout.sidebarPosition || 'left') === val);
    }
  });

  document.querySelectorAll('[data-disp-split]').forEach((b) => {
    b.classList.toggle('active-disp', (layout.splitDirection || 'vertical') === b.dataset.dispSplit);
  });

  document.querySelectorAll('[data-disp-focus]').forEach((b) => {
    const val = b.dataset.dispFocus;
    if (val === 'equal') {
      b.classList.toggle('active-disp', (!layout.focusMode || layout.focusMode === 'none') && Number(layout.requestPanePct) === 50);
    } else {
      b.classList.toggle('active-disp', layout.focusMode === val);
    }
  });
}

function initResizersAndLayout() {
  const layout = getLayoutPrefs();
  state.settings.layout = layout;
  applyLayoutState(layout);

  const sidebar = document.getElementById('appSidebar');
  const sidebarResizer = document.getElementById('sidebarResizer');
  const splitContainer = document.getElementById('workbenchSplitContainer');
  const workbenchResizer = document.getElementById('workbenchResizer');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnToggleSplitLayout = document.getElementById('btnToggleSplitLayout');
  const btnOpenDispositionMenu = document.getElementById('btnOpenDispositionMenu');
  const dispositionPopover = document.getElementById('dispositionPopover');

  // Menu Popover de Disposição das Janelas
  if (btnOpenDispositionMenu && dispositionPopover) {
    btnOpenDispositionMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      dispositionPopover.classList.toggle('hidden');
    });

    window.addEventListener('click', (e) => {
      if (!e.target.closest('.disposition-wrap')) {
        dispositionPopover.classList.add('hidden');
      }
    });
  }

  document.querySelectorAll('[data-disp-sidebar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.dispSidebar;
      if (val === 'toggle') {
        layout.sidebarCollapsed = !layout.sidebarCollapsed;
      } else {
        layout.sidebarPosition = val;
        layout.sidebarCollapsed = false;
      }
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  });

  document.querySelectorAll('[data-disp-split]').forEach((btn) => {
    btn.addEventListener('click', () => {
      layout.splitDirection = btn.dataset.dispSplit;
      layout.focusMode = 'none';
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  });

  document.querySelectorAll('[data-disp-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.dispFocus;
      if (val === 'equal') {
        layout.focusMode = 'none';
        layout.requestPanePct = 50;
      } else {
        layout.focusMode = layout.focusMode === val ? 'none' : val;
      }
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  });

  // Função auxiliar para inverter a posição entre Request e Response
  function swapRequestResponsePanels() {
    layout.focusMode = 'none';
    const map = {
      vertical: 'vertical-reverse',
      'vertical-reverse': 'vertical',
      horizontal: 'horizontal-reverse',
      'horizontal-reverse': 'horizontal'
    };
    layout.splitDirection = map[layout.splitDirection] || 'vertical-reverse';
    applyLayoutState(layout);
    saveLayoutPrefs(layout);
    document.getElementById('statusMessage').textContent = 'Posição das janelas Request ⇄ Response invertida!';
  }

  ['btnSwapPanelsTop', 'btnSwapFromReq', 'btnSwapFromRes'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', swapRequestResponsePanels);
  });

  document.getElementById('btnMaxReqPane')?.addEventListener('click', () => {
    layout.focusMode = layout.focusMode === 'request' ? 'none' : 'request';
    applyLayoutState(layout);
    saveLayoutPrefs(layout);
  });

  document.getElementById('btnMaxResPane')?.addEventListener('click', () => {
    layout.focusMode = layout.focusMode === 'response' ? 'none' : 'response';
    applyLayoutState(layout);
    saveLayoutPrefs(layout);
  });

  // 1. Botão recolher/expandir Menu Lateral
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      layout.sidebarCollapsed = !layout.sidebarCollapsed;
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  }

  // 2. Arrastar barra do Menu Lateral (Sidebar)
  if (sidebarResizer && sidebar) {
    sidebarResizer.addEventListener('dblclick', () => {
      layout.sidebarCollapsed = !layout.sidebarCollapsed;
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });

    sidebarResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      sidebarResizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';

      const onMouseMove = (moveEv) => {
        const isRight = layout.sidebarPosition === 'right';
        const newWidth = isRight ? window.innerWidth - moveEv.clientX : moveEv.clientX;
        if (newWidth < 115) {
          layout.sidebarCollapsed = true;
        } else {
          layout.sidebarCollapsed = false;
          layout.sidebarWidth = Math.max(180, Math.min(680, newWidth));
        }
        applyLayoutState(layout);
      };

      const onMouseUp = () => {
        sidebarResizer.classList.remove('resizing');
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveLayoutPrefs(layout);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // 3. Alternar direção do Split Request/Response (cicla entre as 4 disposições)
  if (btnToggleSplitLayout) {
    btnToggleSplitLayout.addEventListener('click', () => {
      layout.focusMode = 'none';
      const order = ['vertical', 'horizontal', 'vertical-reverse', 'horizontal-reverse'];
      const idx = order.indexOf(layout.splitDirection || 'vertical');
      layout.splitDirection = order[(idx + 1) % order.length];
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });
  }

  // 4. Arrastar divisória principal Request / Response
  if (workbenchResizer && splitContainer) {
    workbenchResizer.addEventListener('dblclick', () => {
      layout.requestPanePct = 50;
      applyLayoutState(layout);
      saveLayoutPrefs(layout);
    });

    workbenchResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      workbenchResizer.classList.add('resizing');
      const dir = layout.splitDirection || 'vertical';
      const isHoriz = dir === 'horizontal' || dir === 'horizontal-reverse';
      const isRev = dir === 'vertical-reverse' || dir === 'horizontal-reverse';
      document.body.style.cursor = isHoriz ? 'col-resize' : 'row-resize';

      const onMouseMove = (moveEv) => {
        const rect = splitContainer.getBoundingClientRect();
        let rawPct = isHoriz
          ? ((moveEv.clientX - rect.left) / Math.max(1, rect.width)) * 100
          : ((moveEv.clientY - rect.top) / Math.max(1, rect.height)) * 100;
        if (isRev) rawPct = 100 - rawPct;
        layout.requestPanePct = Math.round(Math.max(18, Math.min(82, rawPct)));
        applyLayoutState(layout);
      };

      const onMouseUp = () => {
        workbenchResizer.classList.remove('resizing');
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveLayoutPrefs(layout);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // 5. Divisórias internas (.inner-resizer-vertical) em GraphQL, Tests & Captura e Scripts
  document.querySelectorAll('.inner-resizer-vertical').forEach((handle) => {
    const parentSplit = handle.parentElement;
    if (!parentSplit) return;
    const cols = parentSplit.querySelectorAll(':scope > .tests-col');
    if (cols.length < 2) return;
    const leftCol = cols[0];
    const rightCol = cols[1];

    handle.addEventListener('dblclick', () => {
      leftCol.style.flex = '1 1 50%';
      rightCol.style.flex = '1 1 50%';
    });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handle.classList.add('resizing');
      document.body.style.cursor = 'col-resize';

      const onMouseMove = (moveEv) => {
        const rect = parentSplit.getBoundingClientRect();
        const leftPct = Math.max(20, Math.min(80, ((moveEv.clientX - rect.left) / Math.max(1, rect.width)) * 100));
        leftCol.style.flex = `0 0 calc(${leftPct}% - 8px)`;
        rightCol.style.flex = `1 1 calc(${100 - leftPct}% - 8px)`;
      };

      const onMouseUp = () => {
        handle.classList.remove('resizing');
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  });

  // 6. Janelas Modais arrastáveis pelo cabeçalho (.modal-header)
  document.querySelectorAll('.modal').forEach((modal) => {
    const header = modal.querySelector('.modal-header');
    if (!header) return;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input, select')) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = parseFloat(modal.style.left || '0') || 0;
      const origTop = parseFloat(modal.style.top || '0') || 0;

      const onMouseMove = (moveEv) => {
        modal.style.left = `${origLeft + (moveEv.clientX - startX)}px`;
        modal.style.top = `${origTop + (moveEv.clientY - startY)}px`;
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  });
}

/* Inicialização e Eventos */
async function init() {
  const initialData = await IPC.invoke('pm:storage:loadAll');
  state.collections = initialData.collections || [];
  state.environments = initialData.environments || [];
  state.history = initialData.history || [];
  state.cookies = initialData.cookies || [];
  state.settings = initialData.settings || { theme: 'dark', activeEnvironmentId: '' };

  let localBackup = null;
  try {
    localBackup = JSON.parse(localStorage.getItem('carteiro_sessions_backup') || 'null');
  } catch {}
  state.sessions = initialData.sessions || localBackup || { tabs: [], activeTabId: null, responseCache: {} };
  if (!state.sessions.responseCache || Object.keys(state.sessions.responseCache).length === 0) {
    state.sessions.responseCache = initialData.settings?.responseCache || localBackup?.responseCache || {};
  }

  if (initialData.dataDir) {
    document.getElementById('statusStoragePath').textContent = `Armazenamento 100% Local: ${initialData.dataDir}`;
  }

  applyTheme(state.settings.theme);
  initResizersAndLayout();

  if (Array.isArray(state.sessions.tabs) && state.sessions.tabs.length > 0) {
    state.tabs = state.sessions.tabs.map((t) => ({
      ...createBlankTab(t),
      id: t.id || uid('tab'),
      response: t.response || null,
      testResults: t.testResults || null
    }));
    state.activeTabId =
      state.sessions.activeTabId && state.tabs.some((t) => t.id === state.sessions.activeTabId)
        ? state.sessions.activeTabId
        : state.tabs[0].id;
  } else if (state.collections[0]?.items?.[0]) {
    openRequestInTab(state.collections[0].items[0]);
  } else {
    const firstTab = createBlankTab();
    state.tabs.push(firstTab);
    state.activeTabId = firstTab.id;
  }

  // Atalho global Ctrl+K para buscar na Sidebar
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
  });

  // Navegação da Sidebar
  document.querySelectorAll('.sidebar-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.settings.layout?.sidebarCollapsed) {
        state.settings.layout.sidebarCollapsed = false;
        applyLayoutState(state.settings.layout);
        saveLayoutPrefs(state.settings.layout);
      }
      document.querySelectorAll('.sidebar-nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`sidebar-${btn.dataset.sidebarTab}`).classList.add('active');
    });
  });

  document.getElementById('sidebarSearchInput').addEventListener('input', (e) => {
    state.sidebarFilter = e.target.value;
    renderSidebar();
  });

  // Botão Demo Fluxo Encadeado (se existir no DOM)
  document.getElementById('btnCreateChainedDemo')?.addEventListener('click', async () => {
    const req1 = createBlankTab({
      name: 'Login (Obter Token)',
      folder: 'Autenticação Encadeada',
      method: 'POST',
      url: 'https://jsonplaceholder.typicode.com/posts',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: {
        mode: 'json',
        raw: JSON.stringify({ username: 'admin', token: 'jwt-secret-token-{{$timestamp}}' }, null, 2),
        urlencoded: [],
        formdata: []
      },
      assertions: [{ source: 'status', operator: '==', target: '201', enabled: true }],
      captures: [{ key: 'json.token', value: 'api_token', enabled: true }]
    });

    const req2 = createBlankTab({
      name: ' Rota Protegida (Usa Token do Login)',
      folder: 'Autenticação Encadeada',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      auth: {
        type: 'bearer',
        token: '{{@Login (Obter Token).json.token}}',
        username: '',
        password: '',
        keyName: '',
        keyValue: '',
        addTo: 'header'
      },
      assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }]
    });

    state.tabs.push(req1, req2);
    state.activeTabId = req1.id;
    await saveSessionState();
    renderAll();
    document.getElementById('statusMessage').textContent =
      'Fluxo criado! Envie a aba "Login (Obter Token)" e veja o token ser usado automaticamente na aba "Rota Protegida".';
  });

  // Sub-abas da Requisição
  document.querySelectorAll('[data-req-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-req-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.req-tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`req-tab-${btn.dataset.reqTab}`).classList.add('active');
    });
  });

  // Sub-abas da Resposta
  document.querySelectorAll('[data-res-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-res-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.res-tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`res-tab-${btn.dataset.resTab}`).classList.add('active');
    });
  });

  // Eventos de edição da Requisição & Menu de Abas Abertas
  document.getElementById('btnNewTab').addEventListener('click', () => {
    const t = createBlankTab();
    state.tabs.push(t);
    state.activeTabId = t.id;
    saveSessionState();
    renderAll();
  });

  document.getElementById('btnOpenTabsActionsMenu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('tabsContextMenu');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
    } else {
      openTabsContextMenu(state.activeTabId, null, null);
    }
  });

  document.querySelectorAll('[data-tab-bulk-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      executeBulkTabClose(btn.dataset.tabBulkAction);
    });
  });

  document.addEventListener('click', (e) => {
    const tabsMenu = document.getElementById('tabsContextMenu');
    if (tabsMenu && !tabsMenu.classList.contains('hidden')) {
      if (!tabsMenu.contains(e.target) && e.target.id !== 'btnOpenTabsActionsMenu') {
        tabsMenu.classList.add('hidden');
      }
    }
  });

  document.getElementById('reqNameInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.name = e.target.value;
    syncTabBackToCollectionItem(tab);
    renderTabsBar();
    renderSidebar();
  });

  document.getElementById('reqMethod').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.method = e.target.value;
    e.target.dataset.method = tab.method;
    syncTabBackToCollectionItem(tab);
    renderTabsBar();
    renderSidebar();
  });

  document.getElementById('reqUrl').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    const val = e.target.value;
    if (/^\s*curl(\.exe)?\s+/i.test(val)) {
      const parsed = parseCurlCommand(val);
      if (parsed) {
        Object.assign(tab, {
          name: parsed.name,
          method: parsed.method,
          url: parsed.url,
          params: parsed.params,
          headers: parsed.headers,
          auth: parsed.auth,
          body: parsed.body
        });
        document.getElementById('statusMessage').textContent = 'Comando cURL importado automaticamente na aba ativa!';
        renderAll();
        return;
      }
    }
    tab.url = val;
    syncParamsFromUrl(tab);
    updateUrlInterpolatedPreview(tab);
    const pop = document.getElementById('varAutocompletePopover');
    const openIdx = val.lastIndexOf('{{');
    const closeIdx = val.lastIndexOf('}}');
    if (openIdx !== -1 && openIdx > closeIdx) {
      const partial = val.slice(openIdx + 2);
      renderVarAutocompletePopover(partial);
      pop?.classList.remove('hidden');
    } else {
      pop?.classList.add('hidden');
    }
    renderKeyValueTable('paramsTable', tab.params, () => {
      syncUrlFromParams(tab);
      updateUrlInterpolatedPreview(tab);
      renderActiveBadges(tab);
    });
    renderActiveBadges(tab);
  });

  document.getElementById('btnToggleVarPicker')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('varAutocompletePopover');
    if (!pop) return;
    const isHidden = pop.classList.contains('hidden');
    if (isHidden) {
      renderVarAutocompletePopover('');
      pop.classList.remove('hidden');
    } else {
      pop.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('varAutocompletePopover');
    if (pop && !pop.classList.contains('hidden')) {
      if (!pop.contains(e.target) && e.target.id !== 'btnToggleVarPicker' && e.target.id !== 'reqUrl') {
        pop.classList.add('hidden');
      }
    }
  });

  document.getElementById('reqUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendActiveRequest();
  });

  document.getElementById('btnSend').addEventListener('click', sendActiveRequest);

  function serializeKvRowsToBulkText(rows, sep = '=') {
    return (rows || [])
      .filter((r) => r && (r.key || r.value))
      .map((r) => `${r.enabled === false ? '# ' : ''}${r.key || ''}${sep}${r.value ?? ''}`)
      .join('\n');
  }

  function parseBulkTextToKvRows(text, sep = '=') {
    return String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        let enabled = true;
        let clean = line;
        if (clean.startsWith('#')) {
          enabled = false;
          clean = clean.slice(1).trim();
        }
        const idx = clean.indexOf(sep.trim());
        if (idx === -1) return { key: clean, value: '', enabled };
        return {
          key: clean.slice(0, idx).trim(),
          value: clean.slice(idx + sep.trim().length).trim(),
          enabled
        };
      });
  }

  document.getElementById('btnBulkEditParams')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const tableEl = document.getElementById('paramsTable');
    const areaEl = document.getElementById('paramsBulkTextarea');
    if (!tableEl || !areaEl) return;
    const enteringBulk = areaEl.classList.contains('hidden');
    if (enteringBulk) {
      areaEl.value = serializeKvRowsToBulkText(tab.params, '=');
      tableEl.classList.add('hidden');
      areaEl.classList.remove('hidden');
    } else {
      tab.params = parseBulkTextToKvRows(areaEl.value, '=');
      syncUrlFromParams(tab);
      areaEl.classList.add('hidden');
      tableEl.classList.remove('hidden');
      renderActiveRequest();
    }
  });

  document.getElementById('paramsBulkTextarea')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.params = parseBulkTextToKvRows(e.target.value, '=');
    syncUrlFromParams(tab);
    updateUrlInterpolatedPreview(tab);
    renderActiveBadges(tab);
  });

  document.getElementById('btnBulkEditHeaders')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const tableEl = document.getElementById('headersTable');
    const areaEl = document.getElementById('headersBulkTextarea');
    if (!tableEl || !areaEl) return;
    const enteringBulk = areaEl.classList.contains('hidden');
    if (enteringBulk) {
      areaEl.value = serializeKvRowsToBulkText(tab.headers, ': ');
      tableEl.classList.add('hidden');
      areaEl.classList.remove('hidden');
    } else {
      tab.headers = parseBulkTextToKvRows(areaEl.value, ':');
      areaEl.classList.add('hidden');
      tableEl.classList.remove('hidden');
      renderActiveRequest();
    }
  });

  document.getElementById('headersBulkTextarea')?.addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.headers = parseBulkTextToKvRows(e.target.value, ':');
    renderActiveBadges(tab);
  });

  document.getElementById('btnAddParam').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.params.push({ key: '', value: '', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddHeader').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.headers.push({ key: '', value: '', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddAssertion').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.assertions.push({ source: 'status', operator: '==', target: '200', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddCapture').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.captures.push({ key: 'json.id', value: 'captured_id', enabled: true });
    renderActiveRequest();
  });

  // Auth events
  document.getElementById('authType').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.auth.type = e.target.value;
    renderActiveRequest();
  });

  document.getElementById('btnOpenColConfigFromAuth')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab || !tab.collectionId) {
      document.getElementById('statusMessage').textContent = 'Salve esta requisição em uma Collection primeiro (Ctrl+S) para configurar a autenticação da Collection.';
      return;
    }
    const col = state.collections.find((c) => c.id === tab.collectionId);
    if (col) openCollectionConfigModal(col);
  });

  document.getElementById('authBearerToken').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) {
      tab.auth.token = e.target.value;
      renderJwtInspector(tab);
    }
  });

  document.getElementById('authBasicUser').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.username = e.target.value;
  });

  document.getElementById('authBasicPass').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.password = e.target.value;
  });

  document.getElementById('authApiKeyName').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.keyName = e.target.value;
  });

  document.getElementById('authApiKeyValue').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.keyValue = e.target.value;
  });

  document.getElementById('authApiKeyAddTo').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.addTo = e.target.value;
  });

  document.getElementById('oauthGrantType').addEventListener('change', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.grantType = e.target.value;
  });

  document.getElementById('oauthTokenUrl').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.tokenUrl = e.target.value;
  });

  document.getElementById('oauthClientId').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.clientId = e.target.value;
  });

  document.getElementById('oauthClientSecret').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.clientSecret = e.target.value;
  });

  document.getElementById('oauthAccessTokenInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.auth.token = e.target.value;
  });

  document.getElementById('btnFetchOAuthToken').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab || !tab.auth.tokenUrl) {
      document.getElementById('statusMessage').textContent = 'Informe a Access Token URL para obter o token OAuth 2.0.';
      return;
    }
    const res = await IPC.invoke('pm:runtime:request', {
      method: 'POST',
      url: interpolateVariables(tab.auth.tokenUrl),
      headers: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }],
      body: {
        mode: 'urlencoded',
        urlencoded: [
          { key: 'grant_type', value: tab.auth.grantType || 'client_credentials', enabled: true },
          { key: 'client_id', value: interpolateVariables(tab.auth.clientId || ''), enabled: true },
          { key: 'client_secret', value: interpolateVariables(tab.auth.clientSecret || ''), enabled: true }
        ]
      }
    });
    if (res.ok) {
      try {
        const parsed = JSON.parse(res.body);
        const tk = parsed.access_token || parsed.token || parsed.id_token || '';
        if (tk) {
          tab.auth.token = String(tk);
          document.getElementById('oauthAccessTokenInput').value = tab.auth.token;
          document.getElementById('statusMessage').textContent = 'Access Token OAuth 2.0 obtido com sucesso!';
        }
      } catch {}
    } else {
      document.getElementById('statusMessage').textContent = `Falha ao obter token OAuth 2.0: ${res.error || res.statusText}`;
    }
  });

  // Botões de Request Chaining na aba Authorization
  document.getElementById('btnBindChainRef').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const reqRef = document.getElementById('chainSourceReqSelect').value || 'last';
    const fieldPath = document.getElementById('chainSourceFieldSelect').value || 'json.token';
    const expr = `{{@${reqRef}.${fieldPath}}}`;
    if (tab.auth.type === 'bearer' || tab.auth.type === 'oauth2') {
      tab.auth.token = expr;
      document.getElementById('authBearerToken').value = expr;
      document.getElementById('oauthAccessTokenInput').value = expr;
    } else if (tab.auth.type === 'apikey') {
      tab.auth.keyValue = expr;
      document.getElementById('authApiKeyValue').value = expr;
      if (!tab.auth.keyName) {
        tab.auth.keyName = 'X-API-Key';
        document.getElementById('authApiKeyName').value = 'X-API-Key';
      }
    }
    saveSessionState();
    document.getElementById('statusMessage').textContent = `Autenticação vinculada dinamicamente a ${expr}!`;
  });

  document.getElementById('btnBindEnvToken').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) return;
    const reqRef = document.getElementById('chainSourceReqSelect').value || 'last';
    const fieldPath = document.getElementById('chainSourceFieldSelect').value || 'json.token';
    const expr = `{{@${reqRef}.${fieldPath}}}`;
    const resolvedVal = interpolateVariables(expr);

    let env = getActiveEnvironment();
    if (!env) {
      env = state.environments[0] || { id: uid('env'), name: 'Default Environment', variables: [] };
      if (!state.environments.includes(env)) state.environments.push(env);
      state.settings.activeEnvironmentId = env.id;
    }
    const existing = env.variables.find((v) => v.key === 'api_token');
    if (existing) {
      if (resolvedVal !== expr) existing.value = resolvedVal;
      existing.enabled = true;
    } else {
      env.variables.push({ key: 'api_token', value: resolvedVal !== expr ? resolvedVal : '', enabled: true, secret: true });
    }

    const sourceTab = state.tabs.find((t) => (t.name || '').trim().toLowerCase() === reqRef.toLowerCase());
    if (sourceTab) {
      if (!Array.isArray(sourceTab.captures)) sourceTab.captures = [];
      if (!sourceTab.captures.some((c) => c.key === fieldPath && c.value === 'api_token')) {
        sourceTab.captures.push({ key: fieldPath, value: 'api_token', enabled: true });
      }
    }

    if (tab.auth.type === 'bearer' || tab.auth.type === 'oauth2') {
      tab.auth.token = '{{api_token}}';
      document.getElementById('authBearerToken').value = '{{api_token}}';
      document.getElementById('oauthAccessTokenInput').value = '{{api_token}}';
    } else if (tab.auth.type === 'apikey') {
      tab.auth.keyValue = '{{api_token}}';
      document.getElementById('authApiKeyValue').value = '{{api_token}}';
    }

    await persistStore('environments');
    await persistStore('settings');
    await saveSessionState();
    renderSidebar();
    document.getElementById('statusMessage').textContent = `Token vinculado à variável compartilhada {{api_token}} em todas as sessões!`;
  });

  // Body events
  document.querySelectorAll('input[name="bodyMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const tab = getActiveTab();
      if (!tab) return;
      tab.body.mode = e.target.value;
      if (tab.body.mode === 'urlencoded' && (!tab.body.urlencoded || tab.body.urlencoded.length === 0)) {
        tab.body.urlencoded = [{ key: '', value: '', enabled: true }];
      } else if (tab.body.mode === 'formdata' && (!tab.body.formdata || tab.body.formdata.length === 0)) {
        tab.body.formdata = [{ key: '', type: 'text', value: '', enabled: true }];
      }
      renderActiveRequest();
    });
  });

  document.getElementById('bodyRawInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.body.raw = e.target.value;
  });

  document.getElementById('graphqlQueryInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.body.graphqlQuery = e.target.value;
  });

  document.getElementById('graphqlVarsInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (tab) tab.body.graphqlVars = e.target.value;
  });

  document.getElementById('preRequestScriptInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.preRequestScript = e.target.value;
    renderActiveBadges(tab);
  });

  document.getElementById('postResponseScriptInput').addEventListener('input', (e) => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.postResponseScript = e.target.value;
    renderActiveBadges(tab);
  });

  document.getElementById('btnInsertSamplePmScript').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.postResponseScript = [
      `pm.test("Status HTTP é 200 ou 201", () => {`,
      `  pm.expect(pm.response.code).to.be.below(300);`,
      `});`,
      ``,
      `pm.test("Resposta JSON possui dados", () => {`,
      `  const data = pm.response.json();`,
      `  pm.expect(data).to.exist;`,
      `});`
    ].join('\n');
    document.getElementById('postResponseScriptInput').value = tab.postResponseScript;
    renderActiveBadges(tab);
  });

  document.getElementById('btnBeautifyJson').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab || !tab.body.raw) return;
    try {
      tab.body.raw = JSON.stringify(JSON.parse(tab.body.raw), null, 2);
      document.getElementById('bodyRawInput').value = tab.body.raw;
    } catch {
      document.getElementById('statusMessage').textContent = 'JSON inválido para formatação.';
    }
  });

  document.getElementById('btnAddFormRow').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (!Array.isArray(tab.body.urlencoded)) tab.body.urlencoded = [];
    tab.body.urlencoded.push({ key: '', value: '', enabled: true });
    renderActiveRequest();
  });

  document.getElementById('btnAddMultipartRow').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (!Array.isArray(tab.body.formdata)) tab.body.formdata = [];
    tab.body.formdata.push({ key: '', type: 'text', value: '', enabled: true });
    renderActiveRequest();
  });

  // Visualização da Resposta (Pretty / Raw / Filtro JSON / Copiar)
  document.getElementById('btnViewPretty').addEventListener('click', () => {
    state.responseViewMode = 'pretty';
    document.getElementById('btnViewPretty').classList.add('active');
    document.getElementById('btnViewRaw').classList.remove('active');
    renderResponse(getActiveTab());
  });

  document.getElementById('btnViewRaw').addEventListener('click', () => {
    state.responseViewMode = 'raw';
    document.getElementById('btnViewRaw').classList.add('active');
    document.getElementById('btnViewPretty').classList.remove('active');
    renderResponse(getActiveTab());
  });

  document.getElementById('resJsonFilterInput').addEventListener('input', (e) => {
    state.responseJsonFilter = e.target.value;
    renderResponse(getActiveTab());
  });

  document.getElementById('btnCopyResponse').addEventListener('click', () => {
    const text = document.getElementById('responseBodyPre').textContent || '';
    navigator.clipboard.writeText(text);
    document.getElementById('statusMessage').textContent = 'Resposta copiada para a área de transferência.';
  });

  // Tema Dark / Light
  document.getElementById('btnToggleTheme').addEventListener('click', async () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.settings.theme);
    await persistStore('settings');
  });

  // Environment Selector, Profiles, Contorno da Requisição, Segredos e .env
  document.getElementById('envSelect').addEventListener('change', async (e) => {
    state.settings.activeEnvironmentId = e.target.value;
    await persistStore('settings');
    renderAll();
  });

  document.getElementById('envProfileQuickSelect')?.addEventListener('change', async (e) => {
    const chosenProfile = e.target.value;
    let env = getActiveEnvironment();
    if (!env) {
      if (state.environments.length === 0) {
        env = {
          id: uid('env'),
          name: 'JSONPlaceholder (Local)',
          profile: '',
          borderColor: '',
          customProfiles: [],
          profileVariables: {},
          variables: [{ key: 'base_url', value: 'https://jsonplaceholder.typicode.com', enabled: true, secret: false }]
        };
        state.environments.push(env);
      } else {
        env = state.environments[0];
      }
      state.settings.activeEnvironmentId = env.id;
    }

    if (chosenProfile === '__create__') {
      openEnvModal(env.id);
      setTimeout(() => {
        document.getElementById('envNewProfileNameInput')?.focus();
      }, 40);
      applyActiveEnvProfileContour();
      return;
    }

    switchEnvironmentActiveProfile(env, chosenProfile);
    await persistStore('environments');
    await persistStore('settings');
    renderAll();
    const meta = getEnvProfileMeta(env);
    if (meta.label) {
      document.getElementById('statusMessage').textContent = meta.hasContour
        ? `Profile "${meta.label}" ativado em "${env.name}" — Contorno ${meta.borderColor} aplicado na requisição!`
        : `Profile "${meta.label}" ativado em "${env.name}" — Sem contorno customizado na requisição.`;
    } else {
      document.getElementById('statusMessage').textContent = `Environment "${env.name}" sem profile específico ativo.`;
    }
  });

  document.getElementById('envQuickColorPicker')?.addEventListener('input', async (e) => {
    const env = getActiveEnvironment();
    if (!env) return;
    ensureEnvProfileStructure(env);
    env.borderColor = e.target.value;
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) cp.borderColor = e.target.value;
    applyActiveEnvProfileContour();
    await persistStore('environments');
    renderSidebar();
  });

  document.getElementById('envModalProfileSelect')?.addEventListener('change', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    switchEnvironmentActiveProfile(env, e.target.value);
    syncEnvModalProfileControls(env);
    renderEnvVarsTable(env.variables);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  const handleCreateCustomEnvProfile = () => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    ensureEnvProfileStructure(env);
    const nameInput = document.getElementById('envNewProfileNameInput');
    const typedName = (nameInput?.value || '').trim();
    const count = (env.customProfiles?.length || 0) + 1;
    const newProfName = typedName || `Profile ${count}`;
    const newProfId = `prof_${Date.now()}`;

    const modeSelect = document.getElementById('envModalContourModeSelect');
    const colorInput = document.getElementById('envModalBorderColorInput');
    const initialColor = modeSelect?.value === 'custom' ? (colorInput?.value || '#ef4444') : '';

    env.customProfiles.push({
      id: newProfId,
      name: newProfName,
      borderColor: initialColor
    });
    if (nameInput) nameInput.value = '';
    switchEnvironmentActiveProfile(env, newProfId, initialColor);
    syncEnvModalProfileControls(env);
    renderEnvVarsTable(env.variables);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  };

  document.getElementById('btnAddCustomEnvProfile')?.addEventListener('click', handleCreateCustomEnvProfile);

  document.getElementById('envNewProfileNameInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateCustomEnvProfile();
    }
  });

  document.getElementById('btnDeleteCustomEnvProfile')?.addEventListener('click', () => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env || !env.profile) return;
    ensureEnvProfileStructure(env);
    const idx = env.customProfiles.findIndex((cp) => cp.id === env.profile);
    if (idx !== -1) {
      const removedId = env.customProfiles[idx].id;
      env.customProfiles.splice(idx, 1);
      delete env.profileVariables[removedId];
    }
    switchEnvironmentActiveProfile(env, '', '');
    syncEnvModalProfileControls(env);
    renderEnvVarsTable(env.variables);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  document.getElementById('envModalContourModeSelect')?.addEventListener('change', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    const mode = e.target.value;
    if (mode === 'custom') {
      env.borderColor = document.getElementById('envModalBorderColorInput')?.value || '#ef4444';
    } else {
      env.borderColor = '';
    }
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) cp.borderColor = env.borderColor;
    syncEnvModalProfileControls(env);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  document.getElementById('envModalBorderColorInput')?.addEventListener('input', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    env.borderColor = e.target.value;
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) cp.borderColor = env.borderColor;
    syncEnvModalProfileControls(env);
    if (env.id === state.settings.activeEnvironmentId) {
      applyActiveEnvProfileContour();
    }
  });

  document.getElementById('envConfirmDestructiveCheckbox')?.addEventListener('change', (e) => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    const checked = Boolean(e.target.checked);
    const cp = (env.customProfiles || []).find((x) => x.id === env.profile);
    if (cp) {
      cp.confirmDestructive = checked;
    } else {
      env.confirmDestructive = checked;
    }
    updateUrlInterpolatedPreview(getActiveTab());
  });

  document.getElementById('btnManageEnv').addEventListener('click', () => {
    openEnvModal(state.settings.activeEnvironmentId);
  });

  document.getElementById('btnNewEnvironment').addEventListener('click', () => {
    openEnvModal(null);
  });

  document.getElementById('btnAddEnvVar').addEventListener('click', () => {
    const env = state.environments.find((e) => e.id === editingEnvId);
    if (!env) return;
    env.variables.push({ key: '', value: '', enabled: true, secret: false });
    renderEnvVarsTable(env.variables);
  });

  document.getElementById('importEnvFileInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const env = state.environments.find((x) => x.id === editingEnvId);
      if (!env) return;
      String(reader.result || '')
        .split(/\r?\n/)
        .forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const eq = trimmed.indexOf('=');
          if (eq !== -1) {
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
            const existing = env.variables.find((item) => item.key === k);
            if (existing) {
              existing.value = v;
            } else {
              env.variables.push({ key: k, value: v, enabled: true, secret: /token|secret|key|pass/i.test(k) });
            }
          }
        });
      renderEnvVarsTable(env.variables);
    };
    reader.readAsText(file);
  });

  document.getElementById('btnExportEnvFile').addEventListener('click', () => {
    const env = state.environments.find((x) => x.id === editingEnvId);
    if (!env) return;
    const content = (env.variables || [])
      .filter((v) => v.key)
      .map((v) => `${v.key}=${v.value ?? ''}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(env.name || 'environment').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.env`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('btnSaveEnvModal').addEventListener('click', async () => {
    const env = state.environments.find((e) => e.id === editingEnvId);
    if (env) {
      env.name = document.getElementById('envNameInput').value.trim() || 'Environment';
      await persistStore('environments');
      await persistStore('settings');
    }
    document.getElementById('envModal').classList.add('hidden');
    renderSidebar();
  });

  document.getElementById('btnDeleteEnv').addEventListener('click', async () => {
    const idx = state.environments.findIndex((e) => e.id === editingEnvId);
    if (idx !== -1) {
      state.environments.splice(idx, 1);
      if (state.settings.activeEnvironmentId === editingEnvId) {
        state.settings.activeEnvironmentId = state.environments[0]?.id || '';
      }
      await persistStore('environments');
      await persistStore('settings');
    }
    document.getElementById('envModal').classList.add('hidden');
    renderSidebar();
  });

  document.getElementById('btnCloseEnvModal').addEventListener('click', () => {
    document.getElementById('envModal').classList.add('hidden');
  });

  // Cookie Jar Modal events
  document.getElementById('btnOpenCookiesModal').addEventListener('click', () => {
    document.getElementById('networkModal')?.classList.add('hidden');
    renderCookieJarModal();
    document.getElementById('cookiesModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseCookiesModal').addEventListener('click', () => {
    document.getElementById('cookiesModal').classList.add('hidden');
  });

  document.getElementById('btnAddCookieRow').addEventListener('click', () => {
    state.cookies.push({ domain: 'localhost', name: '', value: '', path: '/' });
    renderCookieJarModal();
  });

  document.getElementById('btnClearCookies').addEventListener('click', () => {
    state.cookies = [];
    renderCookieJarModal();
  });

  document.getElementById('btnSaveCookieJar').addEventListener('click', async () => {
    state.cookies = state.cookies.filter((c) => c.domain && c.name);
    await persistStore('cookies');
    document.getElementById('cookiesModal').classList.add('hidden');
    renderActiveRequest();
  });

  // Runner Modal close & Data File (.json / .csv)
  document.getElementById('btnCloseRunnerModal').addEventListener('click', () => {
    document.getElementById('runnerModal').classList.add('hidden');
  });

  document.getElementById('runnerDataFileInput')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    const badge = document.getElementById('runnerDataFileBadge');
    if (!f) {
      runnerDatasetRows = [];
      if (badge) badge.textContent = 'Sem arquivo de dados (1 iteração)';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '').trim();
      try {
        if (f.name.toLowerCase().endsWith('.csv')) {
          runnerDatasetRows = parseRunnerCsvData(raw);
        } else {
          const parsed = JSON.parse(raw);
          runnerDatasetRows = Array.isArray(parsed) ? parsed : [parsed];
        }
        if (badge) badge.textContent = `📎 ${f.name} (${runnerDatasetRows.length} iterações)`;
      } catch {
        runnerDatasetRows = [];
        if (badge) badge.textContent = 'Arquivo inválido';
      }
    };
    reader.readAsText(f);
  });

  document.getElementById('btnRerunCollectionRunner')?.addEventListener('click', () => {
    const col = state.collections.find((c) => c.id === activeRunnerCollectionId);
    if (col) runCollectionSequentially(col);
  });

  // Diff Modal close
  document.getElementById('btnCloseHistoryDiffModal')?.addEventListener('click', () => {
    document.getElementById('historyDiffModal')?.classList.add('hidden');
  });

  // Collection Config Modal (Auth Herdada, Pastas e Variáveis da Collection)
  document.getElementById('btnCloseCollectionConfigModal')?.addEventListener('click', () => {
    document.getElementById('collectionConfigModal')?.classList.add('hidden');
  });

  document.getElementById('colAuthTypeSelect')?.addEventListener('change', (e) => {
    syncCollectionConfigAuthFields(e.target.value);
  });

  document.getElementById('btnAddCollectionVar')?.addEventListener('click', () => {
    const col = state.collections.find((c) => c.id === editingCollectionConfigId);
    if (!col) return;
    if (!Array.isArray(col.variables)) col.variables = [];
    col.variables.push({ key: '', value: '', enabled: true });
    renderKeyValueTable('collectionVarsTable', col.variables, () => {}, {
      key: 'Variável da Collection (ex: service_prefix)',
      value: 'Valor (viaja no arquivo .ovo da Collection)'
    });
  });

  document.getElementById('btnSaveCollectionConfigModal')?.addEventListener('click', async () => {
    const col = state.collections.find((c) => c.id === editingCollectionConfigId);
    if (col) {
      if (Array.isArray(col.variables)) {
        col.variables = col.variables.filter((v) => v && v.key && v.key.trim());
      }
      col.auth = {
        type: document.getElementById('colAuthTypeSelect')?.value || 'none',
        token: document.getElementById('colAuthBearerTokenInput')?.value || '',
        username: document.getElementById('colAuthBasicUserInput')?.value || '',
        password: document.getElementById('colAuthBasicPassInput')?.value || '',
        keyName: document.getElementById('colAuthApiKeyNameInput')?.value || 'X-API-Key',
        keyValue: document.getElementById('colAuthApiKeyValueInput')?.value || '',
        addTo: document.getElementById('colAuthApiKeyAddToSelect')?.value || 'header'
      };
    }
    await persistStore('collections');
    document.getElementById('collectionConfigModal')?.classList.add('hidden');
    renderAll();
    document.getElementById('statusMessage').textContent = `Autenticação, pastas e variáveis da Collection "${col?.name || ''}" salvas!`;
  });

  document.getElementById('btnClearScriptConsole')?.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.scriptConsoleLogs = [];
    renderResponse(tab);
  });

  // Command Palette (Ctrl+K)
  document.getElementById('btnOpenCommandPalette')?.addEventListener('click', openCommandPalette);
  document.getElementById('btnCloseCommandPalette')?.addEventListener('click', () => {
    document.getElementById('commandPaletteModal')?.classList.add('hidden');
  });
  document.getElementById('commandPaletteInput')?.addEventListener('input', (e) => {
    renderCommandPaletteList(e.target.value);
  });
  document.getElementById('commandPaletteInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('commandPaletteModal')?.classList.add('hidden');
    } else if (e.key === 'Enter') {
      const items = getCommandPaletteActions(e.target.value);
      if (items.length > 0) {
        document.getElementById('commandPaletteModal')?.classList.add('hidden');
        items[0].run();
      }
    }
  });

  // Network Modal (Proxy, Certificado SSL/TLS, mTLS & Exportar Workspace .ovo)
  document.getElementById('btnOpenNetworkModal')?.addEventListener('click', openNetworkModal);
  document.getElementById('statusNetworkSummary')?.addEventListener('click', openNetworkModal);

  document.getElementById('btnCloseNetworkModal')?.addEventListener('click', () => {
    document.getElementById('networkModal')?.classList.add('hidden');
  });

  document.getElementById('btnExportWorkspaceOvo')?.addEventListener('click', () => {
    exportWorkspaceAsOvo();
  });

  document.getElementById('btnDownloadResponse')?.addEventListener('click', () => {
    const tab = getActiveTab();
    const bodyText = tab?.response?.body || document.getElementById('responseBodyPre')?.textContent || '';
    if (!bodyText) return;
    let ext = 'txt';
    try {
      JSON.parse(bodyText);
      ext = 'json';
    } catch {}
    const blob = new Blob([bodyText], { type: ext === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = (tab?.name || 'response').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'response';
    a.download = `${slug}-response.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
    document.getElementById('statusMessage').textContent = `Resposta baixada como "${slug}-response.${ext}"!`;
  });

  document.getElementById('netMtlsCertFileInput')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      const net = ensureNetworkSettings();
      net.mtls.fileName = f.name;
      net.mtls.certBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : '';
      net.mtls.enabled = true;
      const chk = document.getElementById('netMtlsEnabledCheckbox');
      const nameBadge = document.getElementById('netMtlsCertFileName');
      if (chk) chk.checked = true;
      if (nameBadge) nameBadge.textContent = f.name;
    };
    reader.readAsDataURL(f);
  });

  document.getElementById('btnClearMtlsCert')?.addEventListener('click', () => {
    const net = ensureNetworkSettings();
    net.mtls.fileName = '';
    net.mtls.certBase64 = '';
    net.mtls.enabled = false;
    const chk = document.getElementById('netMtlsEnabledCheckbox');
    const nameBadge = document.getElementById('netMtlsCertFileName');
    if (chk) chk.checked = false;
    if (nameBadge) nameBadge.textContent = 'Nenhum certificado carregado';
  });

  document.getElementById('netProxyEnabledCheckbox')?.addEventListener('change', (e) => {
    const fieldsBox = document.getElementById('netProxyFieldsContainer');
    if (fieldsBox) {
      fieldsBox.style.opacity = e.target.checked ? '1' : '0.55';
    }
  });

  document.getElementById('btnSaveNetworkModal')?.addEventListener('click', async () => {
    const net = ensureNetworkSettings();
    net.ignoreCertErrors = Boolean(document.getElementById('netIgnoreCertErrorsCheckbox')?.checked);
    net.timeoutMs = Math.max(1000, Number(document.getElementById('netTimeoutMsInput')?.value) || 30000);
    net.mtls = {
      ...net.mtls,
      enabled: Boolean(document.getElementById('netMtlsEnabledCheckbox')?.checked),
      passphrase: document.getElementById('netMtlsPassphraseInput')?.value || ''
    };
    net.proxy = {
      enabled: Boolean(document.getElementById('netProxyEnabledCheckbox')?.checked),
      protocol: document.getElementById('netProxyProtocolSelect')?.value || 'http',
      host: (document.getElementById('netProxyHostInput')?.value || '').trim(),
      port: (document.getElementById('netProxyPortInput')?.value || '8080').trim(),
      username: (document.getElementById('netProxyUsernameInput')?.value || '').trim(),
      password: document.getElementById('netProxyPasswordInput')?.value || '',
      bypass: (document.getElementById('netProxyBypassInput')?.value || '').trim()
    };

    await persistStore('settings');
    document.getElementById('networkModal')?.classList.add('hidden');
    renderNetworkStatusIndicators();

    const sslStatus = net.ignoreCertErrors ? 'Erros de certificado SSL ignorados' : 'Verificação estrita de certificado SSL ativada';
    const proxyStatus = net.proxy.enabled && net.proxy.host
      ? `Proxy ativo (${net.proxy.protocol}://${net.proxy.host}:${net.proxy.port})`
      : 'Sem Proxy';
    document.getElementById('statusMessage').textContent = `Configurações salvas: ${sslStatus} • ${proxyStatus}.`;
  });

  // Collections & History Actions
  document.getElementById('btnNewCollection').addEventListener('click', async () => {
    const newCol = {
      id: uid('col'),
      name: `Collection ${state.collections.length + 1}`,
      items: []
    };
    state.collections.push(newCol);
    state.renamingCollectionId = newCol.id;
    await persistStore('collections');
    renderSidebar();
  });

  async function clearActiveRequestHistory() {
    const tab = getActiveTab();
    if (!tab) return;
    tab.history = [];
    await syncTabBackToCollectionItem(tab);
    await saveSessionState();
    renderAll();
    document.getElementById('statusMessage').textContent = `Histórico individual de "${tab.name || 'Requisição'}" limpo.`;
  }

  document.getElementById('btnClearHistory')?.addEventListener('click', clearActiveRequestHistory);
  document.getElementById('btnClearReqHistoryInline')?.addEventListener('click', clearActiveRequestHistory);

  document.getElementById('btnExportRequestOvo')?.addEventListener('click', () => {
    exportRequestAsOvo(getActiveTab());
  });

  // Salvar Requisição na Collection (se já estiver vinculada a uma Collection, atualiza direto; senão abre modal)
  document.getElementById('btnSaveToCollection').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (tab && tab.collectionId && tab.collectionItemId) {
      await syncTabBackToCollectionItem(tab);
      document.getElementById('statusMessage').textContent = `Alterações salvas na Collection!`;
      renderSidebar();
      return;
    }
    const sel = document.getElementById('saveCollectionSelect');
    sel.innerHTML = '';
    state.collections.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    document.getElementById('newCollectionNameInput').value = '';
    document.getElementById('saveFolderNameInput').value = tab?.folder || '';
    document.getElementById('saveModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseSaveModal').addEventListener('click', () => {
    document.getElementById('saveModal').classList.add('hidden');
  });

  document.getElementById('btnConfirmSaveCollection').addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) return;
    const newColName = document.getElementById('newCollectionNameInput').value.trim();
    const folderName = document.getElementById('saveFolderNameInput').value.trim();
    tab.folder = folderName;

    let targetCol = null;
    if (newColName) {
      targetCol = { id: uid('col'), name: newColName, items: [] };
      state.collections.push(targetCol);
    } else {
      const colId = document.getElementById('saveCollectionSelect').value;
      targetCol = state.collections.find((c) => c.id === colId);
      if (!targetCol) {
        targetCol = { id: uid('col'), name: 'Minhas Requisições', items: [] };
        state.collections.push(targetCol);
      }
    }

    const newReqId = uid('req');
    targetCol.items.push({
      id: newReqId,
      name: tab.name || tab.url,
      folder: folderName,
      method: tab.method,
      url: tab.url,
      params: structuredClone(tab.params),
      headers: structuredClone(tab.headers),
      auth: structuredClone(tab.auth),
      body: structuredClone(tab.body),
      assertions: structuredClone(tab.assertions),
      captures: structuredClone(tab.captures),
      preRequestScript: tab.preRequestScript || '',
      postResponseScript: tab.postResponseScript || '',
      history: Array.isArray(tab.history) ? structuredClone(tab.history) : []
    });
    tab.collectionId = targetCol.id;
    tab.collectionItemId = newReqId;

    await persistStore('collections');
    await saveSessionState();
    document.getElementById('saveModal').classList.add('hidden');
    document.getElementById('statusMessage').textContent = `Salvo em "${targetCol.name}"${folderName ? ` / ${folderName}` : ''}.`;
    renderSidebar();
  });

  // Modal Importar (.ovo / cURL / OpenAPI / Postman v2.1 / Bruno .bru)
  document.getElementById('btnOpenImportModal').addEventListener('click', () => {
    document.getElementById('importTextarea').value = '';
    document.getElementById('importModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseImportModal').addEventListener('click', () => {
    document.getElementById('importModal').classList.add('hidden');
  });

  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('importTextarea').value = String(reader.result || '');
    };
    reader.readAsText(file);
  });

  document.getElementById('btnConfirmImport').addEventListener('click', async () => {
    const raw = document.getElementById('importTextarea').value.trim();
    if (!raw) return;

    // 0. Arquivo Nativo .ovo (Carro do Ovo: Request, Collection ou Workspace Completo)
    const ovoParsed = parseOvoFile(raw);
    if (ovoParsed) {
      if (ovoParsed.kind === 'workspace') {
        if (ovoParsed.collections.length > 0) state.collections.push(...ovoParsed.collections);
        if (ovoParsed.environments.length > 0) state.environments.push(...ovoParsed.environments);
        await persistStore('collections');
        await persistStore('environments');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Workspace nativo .ovo importado (${ovoParsed.collections.length} Collections e ${ovoParsed.environments.length} Environments)!`;
        renderAll();
        return;
      }
      if (ovoParsed.kind === 'request') {
        state.tabs.push(ovoParsed.tab);
        state.activeTabId = ovoParsed.tab.id;
        await saveSessionState();
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Arquivo nativo .ovo ("${ovoParsed.tab.name}") importado em nova aba!`;
        renderAll();
        return;
      }
      if (ovoParsed.kind === 'collection') {
        state.collections.push(ovoParsed.collection);
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Collection nativa .ovo "${ovoParsed.collection.name}" (${ovoParsed.collection.items.length} requisições) importada!`;
        renderAll();
        return;
      }
    }

    // 1. Comando cURL
    if (/^curl(\.exe)?\s+/i.test(raw)) {
      const newTab = parseCurlCommand(raw);
      if (newTab) {
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
        await saveSessionState();
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = 'Comando cURL importado em nova aba!';
        renderAll();
        return;
      }
    }

    // 2. Arquivo .bru (Bruno)
    const bruTab = parseBruFile(raw);
    if (bruTab) {
      state.tabs.push(bruTab);
      state.activeTabId = bruTab.id;
      await saveSessionState();
      document.getElementById('importModal').classList.add('hidden');
      document.getElementById('statusMessage').textContent = `Arquivo Bruno (.bru) "${bruTab.name}" importado em nova aba!`;
      renderAll();
      return;
    }

    // 3. OpenAPI 3.0 / Swagger 2.0 JSON, Postman v2.1 ou Collection JSON
    try {
      const parsed = JSON.parse(raw);
      if (parsed.openapi || parsed.swagger || parsed.paths) {
        const col = convertOpenApiToCarteiro(parsed);
        state.collections.push(col);
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Especificação OpenAPI "${col.name}" (${col.items.length} endpoints) importada!`;
        renderAll();
      } else if (Array.isArray(parsed.item) || parsed.info?.schema?.includes('getpostman')) {
        const col = convertPostmanCollectionToCarteiro(parsed);
        state.collections.push(col);
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Collection Postman "${col.name}" (${col.items.length} requisições) importada!`;
        renderAll();
      } else if (Array.isArray(parsed.items) && parsed.name) {
        state.collections.push({ ...parsed, id: uid('col') });
        await persistStore('collections');
        document.getElementById('importModal').classList.add('hidden');
        document.getElementById('statusMessage').textContent = `Collection "${parsed.name}" importada!`;
        renderAll();
      } else {
        document.getElementById('statusMessage').textContent = 'Formato JSON não reconhecido.';
      }
    } catch {
      document.getElementById('statusMessage').textContent = 'Entrada inválida: informe arquivo .ovo, cURL, .bru (Bruno), OpenAPI 3.0 ou JSON Postman v2.1.';
    }
  });

  // Modal Codegen + Exportador .ovo e .bru
  function updateCodegenPreview() {
    const lang = document.getElementById('codegenLangSelect').value;
    document.getElementById('codegenOutputPre').textContent = generateCodeSnippet(getActiveTab(), lang);
  }

  document.getElementById('btnOpenCodeModal').addEventListener('click', () => {
    updateCodegenPreview();
    document.getElementById('codeModal').classList.remove('hidden');
  });

  document.getElementById('codegenLangSelect').addEventListener('change', updateCodegenPreview);

  document.getElementById('btnCloseCodeModal').addEventListener('click', () => {
    document.getElementById('codeModal').classList.add('hidden');
  });

  document.getElementById('btnCopyCodegen').addEventListener('click', () => {
    const code = document.getElementById('codegenOutputPre').textContent || '';
    navigator.clipboard.writeText(code);
    document.getElementById('statusMessage').textContent = 'Conteúdo copiado para a área de transferência!';
  });

  document.getElementById('btnDownloadOvoFile')?.addEventListener('click', () => {
    exportRequestAsOvo(getActiveTab());
  });

  document.getElementById('btnDownloadBruFile').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const bruContent = generateBruContent(tab);
    const blob = new Blob([bruContent], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(tab.name || 'request').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.bru`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  renderAll();

  window.CDO = window.CDO || {};
  window.CDO.hookBus = window.CDO.hookBus || window.CDO.hooks.createHookBus();
  window.CDO.app = {
    state,
    getActiveTab,
    getActiveEnvironment,
    createBlankTab,
    renderAll,
    renderSidebar,
    renderResponse,
    persistStore,
    saveSessionState,
    interpolateVariables,
    executeTabRequestObject,
    sendActiveRequest
  };
  window.CDO.hookBus.emit('app:ready', { state });
}

window.addEventListener('DOMContentLoaded', init);
