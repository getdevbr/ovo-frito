'use strict';
// Split renderer/app.js into renderer/core/*.js modules by top-level declaration.
// Usage: node scripts/split-app.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'renderer', 'app.js');
const OUT_DIR = path.join(ROOT, 'renderer', 'core');

const MODULES = {
  'state.js': [
    'IPC', 'emitAppHook', 'escapeHtml', 'state', 'sessionChannel',
    'uid', 'generateUuidV4', 'generateRandomCpf', 'generateRandomCnpj',
    'generateRandomCelular', 'generateRandomName', 'generateRandomEmail',
    'persistStore', 'saveSessionState', 'applyTheme'
  ],
  'profiles.js': [
    'getActiveProfile', 'ensureProfileStructure', 'createProfile', 'getProfileMeta',
    'resolveActiveDbConnection', 'applyActiveProfileContour',
    'findCachedResponseByRequestRef', 'isActiveProfileConfirmDestructive',
    'getAllAvailableVariables', 'interpolateVariables',
    'getOrInitActiveProfileForScripts'
  ],
  'tabs.js': [
    'createBlankTab', 'getActiveTab', 'contextMenuTargetTabId',
    'sortTabsWithPinnedFirst', 'openTabsContextMenu', 'isTabDirty',
    'executeBulkTabClose', 'renderTabsBar', 'closeTab',
    'updateUrlInterpolatedPreview', 'renderVarAutocompletePopover'
  ],
  'importer.js': [
    'tokenizeCurlCommand', 'parseCurlCommand', 'parseBruFile', 'parseOvoFile',
    'convertPostmanCollectionToCarteiro', 'buildOpenApiSampleFromSchema',
    'convertOpenApiToCarteiro'
  ],
  'exporter.js': [
    'isSecretLikeValue', 'sanitizeAuthForExport', 'sanitizeHeadersForExport',
    'sanitizeHistoryForExport', 'generateOvoContent', 'exportRequestAsOvo',
    'exportCollectionAsOvo', 'exportWorkspaceAsOvo', 'generateBruContent',
    'generateCodeSnippet', 'exportCollectionAsPostmanV21'
  ],
  'executor.js': [
    'getByPath', 'resolveResponseSourceValue', 'evaluateAssertionsAndCaptures',
    'createScriptConsoleProxy', 'executePreRequestScript',
    'executePostResponseScript', 'executeTabRequestObject', 'sendActiveRequest'
  ],
  'request-editor.js': [
    'syncUrlFromParams', 'syncParamsFromUrl', 'renderKeyValueTable',
    'renderEnvVarsTable', 'renderMultipartTable', 'renderAssertionsTable',
    'resolveEffectiveTabAuth', 'decodeBase64UrlUtf8', 'decodeJwtTokenOffline',
    'renderJwtInspector', 'renderActiveRequest', 'renderActiveBadges',
    'extractJsonCandidatePaths', 'getAvailableChainSources', 'renderAuthChainBox',
    'syncJsonEditor'
  ],
  'response.js': [
    'formatBytes', 'formatHistoryTimestamp', 'renderRequestHistoryPane',
    'formatBodyForDiff', 'openHistoryDiffModal', 'renderResponseCore',
    'renderResponse'
  ],
  'sidebar.js': [
    'renderSidebarCore', 'renderSidebar', 'openRequestInTab',
    'syncTabBackToCollectionItem'
  ],
  'runner.js': [
    'activeRunnerCollectionId', 'runnerDatasetRows', 'parseRunnerCsvData',
    'runCollectionSequentially'
  ],
  'modals.js': [
    'editingProfileId', 'syncProfileModalControls', 'openProfileModal',
    'renderCookieJarModal', 'ensureNetworkSettings',
    'renderNetworkStatusIndicators', 'openNetworkModal',
    'editingCollectionConfigId', 'syncCollectionConfigAuthFields',
    'openCollectionConfigModal', 'getCommandPaletteActions',
    'renderCommandPaletteList', 'openCommandPalette', 'initManualModal',
    'initDevToolboxModal', 'compareContextOptions', 'flattenJsonDiff',
    'runCompareAB', 'initCompareProfileModal'
  ],
  'layout.js': [
    'renderAll', 'getLayoutPrefs', 'saveLayoutPrefs', 'applyLayoutState',
    'initResizersAndLayout', 'UI_MENU_SLOTS', 'UI_MENU_SLOT_BY_ID',
    'UI_MENU_FALLBACK_HOSTS', 'uiMenuSlotForButton', 'relocateUiMenuButtons',
    'initUiDropdownMenus', 'initUiChrome', 'init'
  ]
};

const nameToModule = new Map();
for (const [file, names] of Object.entries(MODULES)) {
  for (const n of names) nameToModule.set(n, file);
}

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const declRe = /^(?:async\s+function|function|const|let|var)\s+([A-Za-z_$][\w$]*)/;

// Find declaration start lines (column 0 only)
const decls = [];
lines.forEach((line, i) => {
  const m = line.match(declRe);
  if (m) decls.push({ line: i, name: m[1] });
});

// For each decl, walk up over blank/comment lines to find block start
function isCommentOrBlank(l) {
  const t = l.trim();
  return t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/');
}

const rawBlocks = decls.map((d) => {
  let start = d.line;
  while (start > 0 && isCommentOrBlank(lines[start - 1])) start--;
  return { name: d.name, declLine: d.line, start };
});

const blocks = rawBlocks.map((b, idx) => {
  const nextStart = idx + 1 < rawBlocks.length ? rawBlocks[idx + 1].start : lines.length;
  let realEnd = nextStart;
  while (realEnd > b.start && lines[realEnd - 1].trim() === '') realEnd--;
  return { name: b.name, start: b.start, end: realEnd };
});

// Assign
const assigned = new Map(); // file -> array of {name, text}
const unassigned = [];
for (const b of blocks) {
  const file = nameToModule.get(b.name);
  const text = lines.slice(b.start, b.end).join('\n').replace(/\n+$/, '') + '\n';
  if (!file) {
    unassigned.push(b.name);
    continue;
  }
  if (!assigned.has(file)) assigned.set(file, []);
  assigned.get(file).push({ name: b.name, text });
}

// Order modules: preserve original decl order inside each file
const ORDER = Object.keys(MODULES);
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const file of ORDER) {
  const chunks = assigned.get(file) || [];
  const content = chunks.map((c) => c.text).join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, file), content, 'utf8');
  console.log(`${file}: ${chunks.length} decls, ${content.split('\n').length} lines`);
}

if (unassigned.length) {
  console.log('UNASSIGNED:', unassigned.join(', '));
}

// Sanity: total lines moved vs original
const moved = ORDER.reduce((acc, f) => {
  const p = path.join(OUT_DIR, f);
  return acc + (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').length - 1 : 0);
}, 0);
console.log(`total moved ~${moved} lines (original ${lines.length})`);
