
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

  const env = getActiveEnvironment();
  if (env && listHasEnabledKey(env.variables, k)) return true;

  return false;
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

(function (root) {
  const api = {
    getActiveEnvironment,
    ensureEnvProfileStructure,
    getEnvProfileMeta,
    switchEnvironmentActiveProfile,
    applyActiveEnvProfileContour,
    findCachedResponseByRequestRef,
    getAllAvailableVariables,
    interpolateVariables,
    getOrInitActiveEnvForScripts,
    isActiveProfileConfirmDestructive,
    isVariableDefined
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CDO = root.CDO || {};
    root.CDO.core = root.CDO.core || {};
    root.CDO.core.env = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

