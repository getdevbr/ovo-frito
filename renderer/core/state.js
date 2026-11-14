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
    if (globalThis.pm && globalThis.pm.sdk && globalThis.pm.sdk.IPC) {
      return await globalThis.pm.sdk.IPC.invoke(channel, payload);
    }
    const res = await fetch('/api/ipc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ovo-Csrf': '1' },
      body: JSON.stringify({ channel, payload })
    });
    return await res.json();
  }
};


function emitAppHook(event, payload) {
  try {
    window.CDO?.hookBus?.emit(event, payload);
  } catch {}
}


const escapeHtml =
  globalThis.CDO?.escape?.escapeHtml ||
  function (value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
const sessionChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ovofrito_session_sync') : null;
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


async function persistStore(key) {
  await IPC.invoke('pm:storage:save', { key, data: state[key] });
  if (sessionChannel && ['environments', 'sessions', 'settings', 'cookies'].includes(key)) {
    sessionChannel.postMessage({ type: 'storage_updated', key });
  }
  if (key === 'collections') {
    emitAppHook('collection:changed', { reason: 'persist' });
  }
}


// Debounce de escritas quentes (ex.: syncTabBackToCollectionItem por keystroke).
// O estado é serializado no momento do flush, então capturas intermediárias não se perdem.
const pendingPersist = new Map();

function schedulePersistStore(key, ms = 400) {
  if (pendingPersist.has(key)) return pendingPersist.get(key);
  const promise = new Promise((resolve) => {
    setTimeout(() => {
      pendingPersist.delete(key);
      persistStore(key).catch(() => {}).finally(resolve);
    }, ms);
  });
  pendingPersist.set(key, promise);
  return promise;
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const key of pendingPersist.keys()) {
      IPC.invoke('pm:storage:save', { key, data: state[key] }).catch(() => {});
    }
  });
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
  try {
    const slimSessions = {
      ...state.sessions,
      tabs: (state.sessions.tabs || []).map(({ response, history, testResults, ...rest }) => rest),
      responseCache: {}
    };
    localStorage.setItem('ovofrito_sessions_backup', JSON.stringify(slimSessions));
  } catch {}
  await persistStore('sessions');
}


function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  const btn = document.getElementById('btnToggleTheme');
  if (btn) {
    btn.textContent = normalized === 'dark' ? '☀ Tema: Escuro (Mudar p/ Claro)' : '🌙 Tema: Claro (Mudar p/ Escuro)';
  }
}

(function (root) {
  const api = {
    IPC,
    emitAppHook,
    escapeHtml,
    state,
    sessionChannel,
    uid,
    generateUuidV4,
    generateRandomCpf,
    generateRandomCnpj,
    generateRandomCelular,
    generateRandomName,
    generateRandomEmail,
    persistStore,
    schedulePersistStore,
    debounce,
    saveSessionState,
    applyTheme
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.state = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

