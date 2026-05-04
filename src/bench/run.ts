// End-to-end benchmark. Boots each server in a child process, runs autocannon
// at increasing payload sizes, prints a side-by-side throughput/latency table.

import { spawn, ChildProcess } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import autocannon from 'autocannon';
import { buildCartPayload } from '../shared/payload';

interface ServerSpec {
  label: string;
  port: number;
  scriptPath: string;
}

const CV_SERVER: ServerSpec = {
  label: 'class-validator',
  port: 3001,
  scriptPath: 'src/classvalidator/main.ts',
};
const AK_SERVER: ServerSpec = {
  label: 'arktype',
  port: 3002,
  scriptPath: 'src/arktype/main.ts',
};

const QUERY = `mutation($input: CartSummaryInput!){ processCart(input:$input){ itemCount totalCents cartId } }`;

const VARIANTS = [
  { label: 'small',  itemCount:  10, tagsPerItem: 2, sponsorsPerItem: 1 },
  { label: 'medium', itemCount:  50, tagsPerItem: 4, sponsorsPerItem: 2 },
  { label: 'large',  itemCount: 200, tagsPerItem: 6, sponsorsPerItem: 4 },
];

const DURATION_SEC = Number(process.env.BENCH_SECONDS ?? 10);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 16);

function startServer(spec: ServerSpec): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn('./node_modules/.bin/ts-node', ['-T', spec.scriptPath], {
      env: { ...process.env, PORT: String(spec.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      if (buf.includes('listening on http')) {
        child.stdout?.off('data', onData);
        resolve(child);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk) => process.stderr.write(`[${spec.label}] ` + chunk));
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`${spec.label} exited ${code}`));
    });
    setTimeout(() => reject(new Error(`${spec.label} did not start within 30s`)), 30000);
  });
}

async function killServer(child: ChildProcess) {
  if (!child.killed) child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
  if (!child.killed) child.kill('SIGKILL');
}

async function runBench(spec: ServerSpec, body: string, label: string) {
  const url = `http://127.0.0.1:${spec.port}/graphql`;
  const result: any = await new Promise((resolve, reject) => {
    const inst = autocannon(
      {
        url,
        method: 'POST',
        connections: CONNECTIONS,
        duration: DURATION_SEC,
        headers: { 'content-type': 'application/json' },
        body,
      },
      (err: any, res: any) => (err ? reject(err) : resolve(res)),
    );
    inst.on('error', reject);
  });
  return {
    label: spec.label,
    variant: label,
    rps: result.requests.average,
    p50: result.latency.p50,
    p95: result.latency.p97_5 ?? result.latency.p95,
    p99: result.latency.p99,
    avgLat: result.latency.average,
    bytesSec: result.throughput.average,
    nonOk: result.non2xx,
  };
}

async function warmup(spec: ServerSpec, body: string) {
  for (let i = 0; i < 30; i++) {
    await fetch(`http://127.0.0.1:${spec.port}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }).then((r) => r.text());
  }
}

async function main() {
  console.log(`bench: duration=${DURATION_SEC}s connections=${CONNECTIONS}`);
  console.log(`node ${process.version}`);
  console.log();

  const cv = await startServer(CV_SERVER);
  const ak = await startServer(AK_SERVER);
  console.log(`booted: ${CV_SERVER.label} @ ${CV_SERVER.port}, ${AK_SERVER.label} @ ${AK_SERVER.port}`);

  try {
    const rows: any[] = [];
    for (const variant of VARIANTS) {
      const input = buildCartPayload({
        itemCount: variant.itemCount,
        tagsPerItem: variant.tagsPerItem,
        sponsorsPerItem: variant.sponsorsPerItem,
      });
      const body = JSON.stringify({ query: QUERY, variables: { input } });
      const sizeKB = (Buffer.byteLength(body) / 1024).toFixed(1);

      console.log(`---- variant=${variant.label} items=${variant.itemCount} body≈${sizeKB} KB ----`);
      await warmup(CV_SERVER, body);
      const cvRes = await runBench(CV_SERVER, body, variant.label);
      await warmup(AK_SERVER, body);
      const akRes = await runBench(AK_SERVER, body, variant.label);

      printRow(cvRes);
      printRow(akRes);
      console.log(
        `  speedup: ${(akRes.rps / cvRes.rps).toFixed(2)}x rps  ${(cvRes.p99 / Math.max(akRes.p99, 1)).toFixed(2)}x lower p99`,
      );
      rows.push(cvRes, akRes);
      console.log();
    }

    // Summary table
    console.log('=== summary ===');
    console.log('variant      | server          | rps     | mean(ms) | p50  | p95  | p99   | non-2xx');
    for (const r of rows) {
      console.log(
        `${r.variant.padEnd(12)} | ${r.label.padEnd(15)} | ${String(Math.round(r.rps)).padStart(7)} | ${r.avgLat.toFixed(2).padStart(8)} | ${String(r.p50).padStart(4)} | ${String(r.p95).padStart(4)} | ${String(r.p99).padStart(5)} | ${r.nonOk}`,
      );
    }
  } finally {
    await killServer(cv);
    await killServer(ak);
  }
}

function printRow(r: any) {
  console.log(
    `  ${r.label.padEnd(15)} rps=${String(Math.round(r.rps)).padStart(6)}  mean=${r.avgLat.toFixed(2).padStart(6)}ms  p50=${String(r.p50).padStart(4)}  p95=${String(r.p95).padStart(4)}  p99=${String(r.p99).padStart(5)}  non2xx=${r.nonOk}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
