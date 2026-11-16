
/**
 * Profiles — entidade única de variáveis/ambiente do app.
 * Cada Profile guarda suas próprias variáveis, conexão de banco,
 * contorno colorido da requisição e travas de segurança.
 * Não existe mais a camada "Environment": o Profile é o contexto ativo.
 */
function getActiveProfile() {
  const list = Array.isArray(state.profiles) ? state.profiles : [];
  return list.find((p) => p.id === state.settings?.activeProfileId) || list[0] || null;
}


function ensureProfileStructure(profile) {
  if (!profile) return null;
  if (!Array.isArray(profile.variables)) {
    profile.variables = [];
  }
  if (profile.borderColor === undefined) {
    profile.borderColor = '';
  }
  if (profile.isProduction === undefined) {
    profile.isProduction = false;
  }
  if (profile.confirmDestructive === undefined) {
    profile.confirmDestructive = false;
  }
  if (!profile.database || typeof profile.database !== 'object') {
    profile.database = {
      enabled: false,
      client: 'postgres',
      connectionString: '',
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: '',
      database: ':memory:',
      ssl: false
    };
  }
  return profile;
}


function createProfile(name = '') {
  const profile = {
    id: uid('prof'),
    name: name || `Profile ${state.profiles.length + 1}`,
    borderColor: '',
    isProduction: false,
    confirmDestructive: false,
    database: {
      enabled: false,
      client: 'postgres',
      connectionString: '',
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: '',
      database: ':memory:',
      ssl: false
    },
    variables: []
  };
  state.profiles.push(profile);
  return profile;
}


function getProfileMeta(profile) {
  if (!profile) {
    return { label: '', icon: '⚪', borderColor: '', hasContour: false };
  }
  ensureProfileStructure(profile);
  const color = profile.borderColor || '';
  return {
    label: profile.name || '',
    icon: color ? '🎨' : '🏷️',
    borderColor: color,
    hasContour: Boolean(color)
  };
}


function resolveActiveDbConnection(profile = getActiveProfile()) {
  if (!profile) return null;
  ensureProfileStructure(profile);
  const dbCfg = profile.database;
  if (!dbCfg || !dbCfg.enabled) return null;
  return {
    enabled: true,
    profileId: profile.id,
    client: interpolateVariables(String(dbCfg.client || 'postgres')).trim().toLowerCase(),
    connectionString: interpolateVariables(String(dbCfg.connectionString || '')),
    host: interpolateVariables(String(dbCfg.host || '127.0.0.1')),
    port: Number(interpolateVariables(String(dbCfg.port || (dbCfg.client === 'mysql' ? 3306 : 5432)))) || 5432,
    user: interpolateVariables(String(dbCfg.user || '')),
    password: interpolateVariables(String(dbCfg.password || '')),
    database: interpolateVariables(String(dbCfg.database || '')),
    ssl: Boolean(dbCfg.ssl)
  };
}


function applyActiveProfileContour() {
  const workbench = document.querySelector('.workbench');
  const badge = document.getElementById('reqProfileContourBadge');
  const quickSelect = document.getElementById('profileSelect');
  const quickColor = document.getElementById('profileColorPicker');
  const profile = getActiveProfile();
  const meta = getProfileMeta(profile);

  // Sincroniza seletor rápido de Profile na Topbar
  if (quickSelect) {
    quickSelect.innerHTML = '';
    if (Array.isArray(state.profiles)) {
      state.profiles.forEach((p) => {
        const m = getProfileMeta(p);
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${m.borderColor ? '🎨' : '🏷️'} ${p.name}`;
        quickSelect.appendChild(opt);
      });
    }
    const createOpt = document.createElement('option');
    createOpt.value = '__create__';
    createOpt.textContent = '+ Novo Profile...';
    quickSelect.appendChild(createOpt);

    quickSelect.value = profile ? profile.id : '';
  }

  if (quickColor) {
    if (profile && meta.hasContour && meta.borderColor) {
      quickColor.classList.remove('hidden');
      quickColor.value = meta.borderColor;
    } else {
      quickColor.classList.add('hidden');
    }
  }

  if (!workbench) return;

  if (profile && meta.hasContour && meta.borderColor) {
    workbench.classList.add('has-req-profile-contour');
    workbench.style.setProperty('--req-profile-border-color', meta.borderColor);
    workbench.style.setProperty('--req-profile-tint', `${meta.borderColor}24`);
    if (badge) {
      badge.classList.remove('hidden');
      badge.style.backgroundColor = meta.borderColor;
      badge.style.borderColor = meta.borderColor;
      badge.textContent = `${meta.icon} ${meta.label || 'Profile'}`;
      badge.title = `Profile "${meta.label}" (${meta.borderColor})`;
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


function isActiveProfileConfirmDestructive(profile = getActiveProfile()) {
  return Boolean(profile?.confirmDestructive);
}


function isActiveProfileProduction(profile = getActiveProfile()) {
  return Boolean(profile?.isProduction);
}


function getAllAvailableVariables(tab = getActiveTab()) {
  const list = [];
  const seen = new Set();

  // 1. Variáveis do Profile ativo
  const profile = getActiveProfile();
  if (profile && Array.isArray(profile.variables)) {
    const scopeName = `Profile: ${profile.name || 'Ativo'}`;
    for (const v of profile.variables) {
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
 * Interpola variáveis do Profile `{{var}}` + Variáveis da Collection + Iteração do Runner
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

  // 2. Variáveis do Profile ativo
  const profile = getActiveProfile();
  if (profile && Array.isArray(profile.variables)) {
    for (const v of profile.variables) {
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
    if (k.startsWith('vault.')) return match;
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


const DYNAMIC_VAR_KEYS = new Set([
  '$guid', '$uuid', '$timestamp', '$isoTimestamp', '$isoDate',
  '$randomInt', '$randomEmail', '$randomName',
  '$randomCPF', '$randomCNPJ', '$randomCelular'
]);

function listHasEnabledKey(list, key) {
  return Array.isArray(list) && list.some((v) => v && v.enabled !== false && String(v.key || '').trim() === key);
}

/**
 * Retorna true se `{{key}}` resolve para um valor (usado para colorir
 * variáveis preenchidas de verde e não resolvidas de vermelho).
 */
function isVariableDefined(rawKey) {
  const k = String(rawKey || '').trim();
  if (!k) return false;

  if (DYNAMIC_VAR_KEYS.has(k)) return true;
  if (window.CDO?.generatorsBr?.GENERATOR_MAP && typeof window.CDO.generatorsBr.GENERATOR_MAP[k] === 'function') return true;

  if (k.startsWith('@')) {
    const expr = k.slice(1).trim();
    const dotIdx = expr.indexOf('.');
    const reqRef = dotIdx !== -1 ? expr.slice(0, dotIdx).trim() : expr;
    const targetRes = findCachedResponseByRequestRef(reqRef);
    if (!targetRes) return false;
    if (dotIdx === -1) return true;
    const fieldExpr = expr.slice(dotIdx + 1).trim();
    let parsed = null;
    try { parsed = JSON.parse(targetRes.body); } catch {}
    return resolveResponseSourceValue(targetRes, parsed, fieldExpr) !== undefined;
  }

  if (state.runnerIterationVars && typeof state.runnerIterationVars === 'object' &&
      Object.prototype.hasOwnProperty.call(state.runnerIterationVars, k)) {
    return true;
  }

  const activeTab = getActiveTab();
  if (activeTab && activeTab.collectionId) {
    const col = state.collections.find((c) => c.id === activeTab.collectionId);
    if (col && listHasEnabledKey(col.variables, k)) return true;
  }

  const profile = getActiveProfile();
  if (profile && listHasEnabledKey(profile.variables, k)) return true;

  return false;
}


/* ============================================================================
 * US-10: Executor de Pre-request & Post-response Scripts (Compatível com `pm.*`)
 * ============================================================================ */
function getOrInitActiveProfileForScripts() {
  let profile = getActiveProfile();
  if (!profile) {
    if (!Array.isArray(state.profiles) || state.profiles.length === 0) {
      profile = createProfile('Padrão');
    } else {
      profile = state.profiles[0];
    }
    state.settings.activeProfileId = profile.id;
  }
  ensureProfileStructure(profile);
  return profile;
}

(function (root) {
  const api = {
    getActiveProfile,
    ensureProfileStructure,
    createProfile,
    getProfileMeta,
    resolveActiveDbConnection,
    applyActiveProfileContour,
    findCachedResponseByRequestRef,
    getAllAvailableVariables,
    interpolateVariables,
    getOrInitActiveProfileForScripts,
    isActiveProfileConfirmDestructive,
    isActiveProfileProduction,
    isVariableDefined
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.profiles = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
