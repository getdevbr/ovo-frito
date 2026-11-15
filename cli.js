#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCliRunner, toJUnit } = require('./main/cli-runner');

function usage() {
  return `Uso:
  ovo-frito run <arquivo.ovo|pasta-com-.ovo> [opções]

Opções:
  --var KEY=VALUE        Variável extra (repetível)
  --env-file <path>      Arquivo .env simples (KEY=VALUE por linha)
  --report json|junit    Formato do relatório (padrão: json)
  --output <path>        Gravar relatório em arquivo
  --stop-on-failure      Para na primeira falha
  --timeout <ms>         Timeout por requisição (padrão: 30000)
  --data-dir <path>      Diretório de dados temporário do runner
  --vault-password-env <VAR>  Nome da variável de ambiente com a master password do cofre
                               (necessário para requests com {{vault.*}}; a senha nunca vai na linha de comando)
`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--var') {
      const kv = argv[++i] || '';
      const idx = kv.indexOf('=');
      if (idx > 0) args.var = args.var || {}, args.var[kv.slice(0, idx)] = kv.slice(idx + 1);
    } else if (a === '--env-file') {
      args.envFile = argv[++i];
    } else if (a === '--report') {
      args.report = argv[++i] || 'json';
    } else if (a === '--output') {
      args.output = argv[++i];
    } else if (a === '--stop-on-failure') {
      args.stopOnFailure = true;
    } else if (a === '--timeout') {
      args.timeout = Number(argv[++i]) || 30000;
    } else if (a === '--data-dir') {
      args.dataDir = argv[++i];
    } else if (a === '--vault-password-env') {
      args.vaultPasswordEnv = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function readEnvFile(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._[0] !== 'run' || !args._[1]) {
    process.stdout.write(usage());
    process.exit(args.help ? 0 : 1);
  }

  const target = path.resolve(args._[1]);
  if (!fs.existsSync(target)) {
    process.stderr.write(`Alvo não encontrado: ${target}\n`);
    process.exit(1);
  }

  let vaultPassword = null;
  if (args.vaultPasswordEnv) {
    vaultPassword = process.env[args.vaultPasswordEnv];
    if (!vaultPassword) {
      process.stderr.write(`Variável de ambiente não definida ou vazia: ${args.vaultPasswordEnv}\n`);
      process.exit(1);
    }
  }

  const variables = { ...readEnvFile(args.envFile), ...(args.var || {}) };
  const runner = createCliRunner({ dataDir: args.dataDir, variables, timeoutMs: args.timeout, vaultPassword });
  const results = await runner.runFile(target, { stopOnFailure: Boolean(args.stopOnFailure) });

  const vaultLocked = results.filter((r) => r.error && (r.error.code === 'VAULT_LOCKED' || r.error.code === 'VAULT_KEY_NOT_FOUND'));
  if (vaultLocked.length > 0) {
    process.stderr.write(
      `${vaultLocked.length} requisição(ões) usam {{vault.*}} mas o cofre está bloqueado ou a chave não existe. ` +
      `Use --vault-password-env <VAR> com a master password do cofre.\n`
    );
  }

  const report = args.report === 'junit' ? toJUnit(results, path.basename(target)) : JSON.stringify({ target, results }, null, 2);
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(path.resolve(args.output), report, 'utf8');
  } else {
    process.stdout.write(`${report}\n`);
  }

  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
