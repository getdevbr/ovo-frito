'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createDbEngine, normalizePositionalSql } = require('../../main/db-engine');
const { runUserScriptAsync } = require('../../main/script-sandbox');
const { evaluateAssertions, resolveResponseSourceValue } = require('../../renderer/lib/assertions');
const { createCliRunner } = require('../../main/cli-runner');

test('normalizePositionalSql converte $1, $2 para ? no SQLite/MySQL preservando strings e repeticoes', () => {
  const res = normalizePositionalSql(
    "SELECT id, '$99' AS literal FROM users WHERE id = $1 AND status = $2 AND parent_id = $1",
    [42, 'active']
  );
  assert.equal(
    res.sql,
    "SELECT id, '$99' AS literal FROM users WHERE id = ? AND status = ? AND parent_id = ?"
  );
  assert.deepEqual(res.params, [42, 'active', 42]);
});

test('Cenario 1 (Gherkin): Pos-request — Assert de criacao de registro apos POST /users (Declarativo + Script pm.db.query)', async (t) => {
  const dbEngine = createDbEngine();
  const dbConnection = {
    enabled: true,
    client: 'sqlite',
    database: ':memory:',
    envId: 'env_gherkin_scenario_1'
  };

  // Prepara schema inicial no banco de dados configurado no ambiente
  const initRes = await dbEngine.executeQuery({
    connection: dbConnection,
    query: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)'
  });
  assert.equal(initRes.ok, true);

  // Servidor HTTP local simulando a API POST /users que persiste no banco e retorna 201 {"id": 42, "status": "created"}
  const server = http.createServer((req, res) => {
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', async () => {
      if (req.method === 'POST' && req.url === '/users') {
        const payload = JSON.parse(rawBody || '{}');
        await dbEngine.executeQuery({
          connection: dbConnection,
          query: 'INSERT INTO users (id, name, email) VALUES ($1, $2, $3)',
          params: [42, payload.name, payload.email]
        });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 42, status: 'created' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await dbEngine.closeAll();
  });

  const runner = createCliRunner({
    database: dbConnection,
    dbEngine
  });

  // Executa a requisicao POST /users com query pos-request e assertions sobre dbResult.rows[0].name e dbResult.rowCount
  const results = await runner.runRequests([
    {
      name: 'Criar Usuario Carlos',
      method: 'POST',
      url: `http://127.0.0.1:${port}/users`,
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: {
        mode: 'json',
        raw: JSON.stringify({ name: 'Carlos', email: 'carlos@example.com' })
      },
      postDbQueries: [
        {
          id: 'q1',
          name: 'verify_user',
          query: 'SELECT id, name, email FROM users WHERE id = $1',
          params: '[response.body.id]',
          enabled: true
        }
      ],
      assertions: [
        { source: 'status', operator: '==', target: '201', enabled: true },
        { source: 'dbResult.rows[0].name', operator: '==', target: 'Carlos', enabled: true },
        { source: 'dbResult.rowCount', operator: '==', target: '1', enabled: true }
      ],
      postResponseScript: `
        pm.test("Validar dbResult via script pos-request", async () => {
          const dbResult = await pm.db.query("SELECT id, name, email FROM users WHERE id = $1", [response.body.id]);
          pm.expect(dbResult.rows[0].name === "Carlos").to.be.true;
          pm.expect(dbResult.rowCount === 1).to.be.true;
        });
      `
    }
  ]);

  assert.equal(results.length, 1);
  const r = results[0];
  assert.equal(r.status, 201);
  assert.equal(r.ok, true, `Esperava sucesso, mas falhou: ${JSON.stringify(r.assertions)}`);
  assert.equal(r.dbResult.rowCount, 1);
  assert.equal(r.dbResult.rows[0].id, 42);
  assert.equal(r.dbResult.rows[0].name, 'Carlos');
  assert.equal(r.dbResult.rows[0].email, 'carlos@example.com');
  assert.ok(r.assertions.every((a) => a.passed));
});

test('Pre-request Data Seeding / Data Fetching injeta valores do banco no payload, headers e query params', async (t) => {
  const dbEngine = createDbEngine();
  const dbConnection = {
    enabled: true,
    client: 'sqlite',
    database: ':memory:',
    envId: 'env_prereq_seeding'
  };

  await dbEngine.executeQuery({
    connection: dbConnection,
    query: 'CREATE TABLE seeds (tenant_id TEXT, api_token TEXT, user_email TEXT)'
  });
  await dbEngine.executeQuery({
    connection: dbConnection,
    query: 'INSERT INTO seeds (tenant_id, api_token, user_email) VALUES ($1, $2, $3)',
    params: ['tenant_br_99', 'tok_live_abc123', 'seed@ovofrito.dev']
  });

  let receivedReq = null;
  const server = http.createServer((req, res) => {
    let rawBody = '';
    req.on('data', (c) => {
      rawBody += c;
    });
    req.on('end', () => {
      receivedReq = {
        url: req.url,
        headers: req.headers,
        body: JSON.parse(rawBody || '{}')
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await dbEngine.closeAll();
  });

  const runner = createCliRunner({
    database: dbConnection,
    dbEngine
  });

  const results = await runner.runRequests([
    {
      name: 'Request com Seeding SQL Pre-request',
      method: 'POST',
      url: `http://127.0.0.1:${port}/check?tenant={{seeded_tenant}}`,
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'X-Seed-Token', value: '{{seeded_token}}', enabled: true }
      ],
      body: {
        mode: 'json',
        raw: JSON.stringify({ email: '{{seeded_email}}', extraFromScript: '{{script_seeded_role}}' })
      },
      preDbQueries: [
        {
          id: 'pre1',
          name: 'fetch_seed',
          query: 'SELECT tenant_id, api_token, user_email FROM seeds WHERE tenant_id = $1',
          params: '["tenant_br_99"]',
          captures: 'rows[0].tenant_id -> seeded_tenant, rows[0].api_token -> seeded_token, rows[0].user_email -> seeded_email',
          enabled: true
        }
      ],
      preRequestScript: `
        const res = await pm.db.query("SELECT 'admin_master' AS role");
        pm.environment.set("script_seeded_role", res.rows[0].role);
      `,
      assertions: [{ source: 'status', operator: '==', target: '200', enabled: true }]
    }
  ]);

  assert.equal(results[0].ok, true);
  assert.equal(receivedReq.url, '/check?tenant=tenant_br_99');
  assert.equal(receivedReq.headers['x-seed-token'], 'tok_live_abc123');
  assert.deepEqual(receivedReq.body, {
    email: 'seed@ovofrito.dev',
    extraFromScript: 'admin_master'
  });
});
