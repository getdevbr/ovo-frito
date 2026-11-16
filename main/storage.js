'use strict';

const fs = require('fs');
const path = require('path');

function getDefaultCollections() {
  return [
    {
      id: 'col_sample_1',
      name: 'JSONPlaceholder API',
      items: [
        {
          id: 'req_sample_1',
          name: '1. Criar Post (Gera ID/Token)',
          folder: 'Fluxo Encadeado',
          method: 'POST',
          url: '{{base_url}}/posts',
          params: [],
          headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
          auth: { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '', addTo: 'header' },
          body: {
            mode: 'json',
            raw: JSON.stringify({ title: 'Carteiro Local-First', body: 'Reconstruído via REA', userId: 1 }, null, 2),
            urlencoded: [],
            formdata: []
          },
          assertions: [{ source: 'status', operator: '==', target: '201', enabled: true }],
          captures: [{ key: 'json.id', value: 'ultimo_post_id', enabled: true }]
        },
        {
          id: 'req_sample_2',
          name: '2. Listar Posts (Usa Auth da Req 1)',
          folder: 'Fluxo Encadeado',
          method: 'GET',
          url: '{{base_url}}/posts?_limit=5',
          params: [{ key: '_limit', value: '5', enabled: true }],
          headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
          auth: {
            type: 'bearer',
            token: '{{@1. Criar Post (Gera ID/Token).json.id}}',
            username: '',
            password: '',
            keyName: '',
            keyValue: '',
            addTo: 'header'
          },
          body: { mode: 'none', raw: '', urlencoded: [], formdata: [] },
          assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }],
          captures: []
        }
      ]
    }
  ];
}

function getDefaultProfiles() {
  return [
    {
      id: 'prof_default',
      name: 'Padrão',
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
      variables: [
        { key: 'base_url', value: 'https://jsonplaceholder.typicode.com', enabled: true, secret: false },
        { key: 'api_token', value: 'demo-secret-token', enabled: true, secret: true }
      ]
    }
  ];
}

function createStorage({ dataDir } = {}) {
  const resolvedDataDir = path.resolve(
    dataDir || process.env.CDO_DATA_DIR || path.join(process.cwd(), 'data')
  );

  const files = {
    collections: path.join(resolvedDataDir, 'collections.json'),
    profiles: path.join(resolvedDataDir, 'profiles.json'),
    history: path.join(resolvedDataDir, 'history.json'),
    settings: path.join(resolvedDataDir, 'settings.json'),
    sessions: path.join(resolvedDataDir, 'sessions.json'),
    cookies: path.join(resolvedDataDir, 'cookies.json'),
    trash: path.join(resolvedDataDir, 'trash.json')
  };

  function ensurePortableDataDir() {
    if (!fs.existsSync(resolvedDataDir)) {
      fs.mkdirSync(resolvedDataDir, { recursive: true });
    }

    const defaults = {
      collections: getDefaultCollections(),
      profiles: getDefaultProfiles(),
      history: [],
      settings: {
        theme: 'dark',
        activeProfileId: 'prof_default',
        timeoutMs: 30000
      },
      sessions: {
        tabs: [],
        activeTabId: null,
        responseCache: {}
      },
      cookies: [],
      trash: []
    };

    for (const [key, filePath] of Object.entries(files)) {
      if (!fs.existsSync(filePath)) {
        writeAtomic(filePath, JSON.stringify(defaults[key], null, 2));
      }
    }
  }

  function writeAtomic(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.chmodSync(tmpPath, 0o600);
    } catch {}
    fs.renameSync(tmpPath, filePath);
  }

  function readStore(key) {
    try {
      if (!files[key] || !fs.existsSync(files[key])) return null;
      return JSON.parse(fs.readFileSync(files[key], 'utf8'));
    } catch (err) {
      console.error(`Erro ao ler ${key}:`, err);
      return null;
    }
  }

  function writeStore(key, data) {
    try {
      if (!files[key]) return false;
      writeAtomic(files[key], JSON.stringify(data));
      return true;
    } catch (err) {
      console.error(`Erro ao salvar ${key}:`, err);
      return false;
    }
  }

  return {
    dataDir: resolvedDataDir,
    files,
    ensurePortableDataDir,
    readStore,
    writeStore,
    writeAtomic
  };
}

module.exports = {
  createStorage
};
