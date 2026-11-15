'use strict';

const path = require('node:path');

/**
 * Converte placeholders posicionais estilo PostgreSQL ($1, $2, ...) para `?`
 * expandindo os parâmetros na ordem em que aparecem, sem alterar ocorrências
 * dentro de literais string ('...' ou "...").
 */
function normalizePositionalSql(sql, params = []) {
  if (typeof sql !== 'string' || !Array.isArray(params) || params.length === 0) {
    return { sql: String(sql || ''), params: Array.isArray(params) ? params : [] };
  }
  if (!/\$\d+/.test(sql)) {
    return { sql, params };
  }

  const expandedParams = [];
  let out = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      out += ch;
      if (inSingle && sql[i + 1] === "'") {
        out += sql[++i];
      } else {
        inSingle = !inSingle;
      }
      continue;
    }
    if (ch === '"' && !inSingle) {
      out += ch;
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '$') {
      const match = sql.slice(i).match(/^\$(\d+)/);
      if (match) {
        const idx = Number(match[1]) - 1;
        expandedParams.push(idx >= 0 && idx < params.length ? params[idx] : null);
        out += '?';
        i += match[0].length - 1;
        continue;
      }
    }
    out += ch;
  }

  return { sql: out, params: expandedParams };
}

function normalizeSqliteParam(val) {
  if (val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (val instanceof Date) return val.toISOString();
  if (val !== null && typeof val === 'object' && !Buffer.isBuffer(val) && !(val instanceof Uint8Array)) {
    return JSON.stringify(val);
  }
  return val;
}

function createDbEngine({ dataDir } = {}) {
  const sqliteMemoryCache = new Map();

  function getSqliteDatabase(connection = {}) {
    const { DatabaseSync } = require('node:sqlite');
    const rawFile = String(connection.database || connection.filename || connection.connectionString || ':memory:').trim() || ':memory:';
    const isMemory = rawFile === ':memory:' || rawFile.startsWith('sqlite://:memory:');
    if (isMemory) {
      const cacheKey = String(connection.cacheKey || connection.envId || 'default_memory');
      if (!sqliteMemoryCache.has(cacheKey)) {
        sqliteMemoryCache.set(cacheKey, new DatabaseSync(':memory:'));
      }
      return { db: sqliteMemoryCache.get(cacheKey), closeAfter: false };
    }
    const cleanPath = rawFile.replace(/^sqlite:\/\/\/?/i, '');
    const resolved = path.isAbsolute(cleanPath)
      ? cleanPath
      : path.resolve(dataDir || process.cwd(), cleanPath);
    return { db: new DatabaseSync(resolved), closeAfter: true };
  }

  async function executeSqlite(connection, rawSql, rawParams = []) {
    const { db, closeAfter } = getSqliteDatabase(connection);
    try {
      const { sql, params } = normalizePositionalSql(rawSql, rawParams);
      const safeParams = (params || []).map(normalizeSqliteParam);
      const trimmed = sql.trim();

      // Se não há parâmetros e há múltiplos statements separados por ';', executa via exec()
      const statements = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
      if (safeParams.length === 0 && statements.length > 1) {
        db.exec(trimmed);
        return { rows: [], rowCount: 0, fields: [], command: 'EXEC' };
      }

      const stmt = db.prepare(trimmed);
      const isReader = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed);
      if (isReader) {
        const rows = stmt.all(...safeParams).map((r) => ({ ...r }));
        const fields = rows.length > 0 ? Object.keys(rows[0]) : [];
        return {
          rows,
          rowCount: rows.length,
          fields,
          command: trimmed.split(/\s+/)[0].toUpperCase()
        };
      }

      const info = stmt.run(...safeParams);
      return {
        rows: [],
        rowCount: Number(info?.changes ?? 0),
        lastInsertRowid: info?.lastInsertRowid !== undefined ? Number(info.lastInsertRowid) : undefined,
        fields: [],
        command: trimmed.split(/\s+/)[0].toUpperCase()
      };
    } finally {
      if (closeAfter) {
        try {
          db.close();
        } catch {}
      }
    }
  }

  async function executePostgres(connection, rawSql, rawParams = [], timeoutMs = 10000) {
    const { Client } = require('pg');
    const connStr = String(connection.connectionString || '').trim();
    const clientConfig = connStr
      ? {
          connectionString: connStr,
          ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: timeoutMs,
          query_timeout: timeoutMs
        }
      : {
          host: connection.host || '127.0.0.1',
          port: Number(connection.port) || 5432,
          user: connection.user || connection.username || 'postgres',
          password: connection.password || '',
          database: connection.database || 'postgres',
          ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: timeoutMs,
          query_timeout: timeoutMs
        };

    const client = new Client(clientConfig);
    await client.connect();
    try {
      const res = await client.query(rawSql, Array.isArray(rawParams) ? rawParams : []);
      const rows = Array.isArray(res.rows) ? res.rows : [];
      const rowCount = typeof res.rowCount === 'number' ? res.rowCount : rows.length;
      const fields = Array.isArray(res.fields) ? res.fields.map((f) => f.name) : [];
      return {
        rows,
        rowCount,
        fields,
        command: res.command || ''
      };
    } finally {
      try {
        await client.end();
      } catch {}
    }
  }

  async function executeMysql(connection, rawSql, rawParams = [], timeoutMs = 10000) {
    const mysql = require('mysql2/promise');
    const connStr = String(connection.connectionString || '').trim();
    const connConfig = connStr
      ? connStr
      : {
          host: connection.host || '127.0.0.1',
          port: Number(connection.port) || 3306,
          user: connection.user || connection.username || 'root',
          password: connection.password || '',
          database: connection.database || '',
          ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
          connectTimeout: timeoutMs
        };

    const conn = await mysql.createConnection(connConfig);
    try {
      const { sql, params } = normalizePositionalSql(rawSql, rawParams);
      const [rowsOrHeader, fieldsMeta] = await conn.execute(sql, params);
      if (Array.isArray(rowsOrHeader)) {
        return {
          rows: rowsOrHeader,
          rowCount: rowsOrHeader.length,
          fields: Array.isArray(fieldsMeta) ? fieldsMeta.map((f) => f.name) : [],
          command: sql.trim().split(/\s+/)[0].toUpperCase()
        };
      }
      return {
        rows: [],
        rowCount: Number(rowsOrHeader?.affectedRows ?? 0),
        lastInsertRowid: rowsOrHeader?.insertId ? Number(rowsOrHeader.insertId) : undefined,
        fields: [],
        command: sql.trim().split(/\s+/)[0].toUpperCase()
      };
    } finally {
      try {
        await conn.end();
      } catch {}
    }
  }

  async function executeQuery({ connection = {}, query = '', params = [], timeoutMs = 10000 } = {}) {
    const start = Date.now();
    const sql = String(query || '').trim();
    if (!sql) {
      return { ok: false, error: 'Query SQL vazia.', rows: [], rowCount: 0, fields: [], durationMs: 0 };
    }
    if (!connection || typeof connection !== 'object') {
      return { ok: false, error: 'Conexão de banco de dados não configurada no ambiente atual.', rows: [], rowCount: 0, fields: [], durationMs: 0 };
    }

    const clientType = String(connection.client || connection.type || 'postgres').toLowerCase();
    try {
      let out;
      if (clientType === 'sqlite' || clientType === 'sqlite3') {
        out = await executeSqlite(connection, sql, params);
      } else if (clientType === 'mysql' || clientType === 'mariadb') {
        out = await executeMysql(connection, sql, params, timeoutMs);
      } else if (clientType === 'postgres' || clientType === 'postgresql' || clientType === 'pg') {
        out = await executePostgres(connection, sql, params, timeoutMs);
      } else {
        return {
          ok: false,
          error: `Driver de banco de dados não suportado: "${clientType}" (use postgres, mysql ou sqlite).`,
          rows: [],
          rowCount: 0,
          fields: [],
          durationMs: Date.now() - start
        };
      }

      return {
        ok: true,
        rows: out.rows || [],
        rowCount: typeof out.rowCount === 'number' ? out.rowCount : (out.rows || []).length,
        fields: out.fields || [],
        command: out.command || '',
        lastInsertRowid: out.lastInsertRowid,
        durationMs: Date.now() - start
      };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : String(err),
        rows: [],
        rowCount: 0,
        fields: [],
        durationMs: Date.now() - start
      };
    }
  }

  async function testConnection({ connection = {}, timeoutMs = 5000 } = {}) {
    const clientType = String(connection?.client || connection?.type || 'postgres').toLowerCase();
    const probeSql = 'SELECT 1 AS ok';
    const res = await executeQuery({ connection, query: probeSql, params: [], timeoutMs });
    return {
      ok: res.ok,
      client: clientType,
      durationMs: res.durationMs,
      error: res.error || null,
      rows: res.rows
    };
  }

  function closeAll() {
    for (const db of sqliteMemoryCache.values()) {
      try {
        db.close();
      } catch {}
    }
    sqliteMemoryCache.clear();
  }

  return {
    executeQuery,
    testConnection,
    closeAll,
    normalizePositionalSql
  };
}

module.exports = { createDbEngine, normalizePositionalSql };
