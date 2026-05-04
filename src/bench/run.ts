// End-to-end benchmark across all three engines. Boots each server in a child
// Process, runs autocannon at increasing payload sizes, prints a summary table.

import autocannon from 'autocannon';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { buildCartPayload } from '../shared/payload';

interface ServerSpec {
    label: string;
    port: number;
    scriptPath: string;
}

const SERVERS: ServerSpec[] = [
    { label: 'class-validator', port: 3001, scriptPath: 'src/classvalidator/main.ts' },
    { label: 'zod v4', port: 3003, scriptPath: 'src/zod/main.ts' },
    { label: 'arktype', port: 3002, scriptPath: 'src/arktype/main.ts' },
];

const QUERY = `mutation($input: CartSummaryInput!){ processCart(input:$input){ itemCount totalCents cartId } }`;

const VARIANTS = [
    { itemCount: 10, label: 'small', sponsorsPerItem: 1, tagsPerItem: 2 },
    { itemCount: 50, label: 'medium', sponsorsPerItem: 2, tagsPerItem: 4 },
    { itemCount: 200, label: 'large', sponsorsPerItem: 4, tagsPerItem: 6 },
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
        child.stderr?.on('data', (chunk) => process.stderr.write(`[${spec.label}] ${chunk}`));
        child.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`${spec.label} exited ${code}`));
            }
        });
        setTimeout(() => reject(new Error(`${spec.label} did not start within 30s`)), 30_000);
    });
}

async function killServer(child: ChildProcess) {
    if (!child.killed) {
        child.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 200));
    if (!child.killed) {
        child.kill('SIGKILL');
    }
}

interface BenchResult {
    label: string;
    variant: string;
    rps: number;
    p50: number;
    p95: number;
    p99: number;
    avgLat: number;
    bytesSec: number;
    nonOk: number;
}

async function runBench(spec: ServerSpec, body: string, label: string): Promise<BenchResult> {
    const url = `http://127.0.0.1:${spec.port}/graphql`;
    const result: any = await new Promise((resolve, reject) => {
        const inst = autocannon(
            {
                body,
                connections: CONNECTIONS,
                duration: DURATION_SEC,
                headers: { 'content-type': 'application/json' },
                method: 'POST',
                url,
            },
            (err: any, res: any) => (err ? reject(err) : resolve(res))
        );
        inst.on('error', reject);
    });
    return {
        avgLat: result.latency.average,
        bytesSec: result.throughput.average,
        label: spec.label,
        nonOk: result.non2xx,
        p50: result.latency.p50,
        p95: result.latency.p97_5 ?? result.latency.p95,
        p99: result.latency.p99,
        rps: result.requests.average,
        variant: label,
    };
}

async function warmup(spec: ServerSpec, body: string) {
    for (let i = 0; i < 30; i++) {
        await fetch(`http://127.0.0.1:${spec.port}/graphql`, {
            body,
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        }).then((r) => r.text());
    }
}

async function main() {
    console.log(`bench: duration=${DURATION_SEC}s connections=${CONNECTIONS}`);
    console.log(`node ${process.version}`);
    console.log();

    const procs: { spec: ServerSpec; child: ChildProcess }[] = [];
    for (const spec of SERVERS) {
        procs.push({ child: await startServer(spec), spec });
    }
    console.log(`booted: ${SERVERS.map((s) => `${s.label}@${s.port}`).join(', ')}`);

    try {
        const rows: BenchResult[] = [];
        for (const variant of VARIANTS) {
            const input = buildCartPayload({
                itemCount: variant.itemCount,
                sponsorsPerItem: variant.sponsorsPerItem,
                tagsPerItem: variant.tagsPerItem,
            });
            const body = JSON.stringify({ query: QUERY, variables: { input } });
            const sizeKB = (Buffer.byteLength(body) / 1024).toFixed(1);

            console.log(`---- variant=${variant.label} items=${variant.itemCount} body≈${sizeKB} KB ----`);
            const variantResults: BenchResult[] = [];
            for (const { spec } of procs) {
                await warmup(spec, body);
                const r = await runBench(spec, body, variant.label);
                printRow(r);
                variantResults.push(r);
            }
            // Speedup vs class-validator baseline.
            const baseline = variantResults.find((r) => r.label === 'class-validator');
            if (baseline) {
                for (const r of variantResults) {
                    if (r === baseline) {
                        continue;
                    }
                    const rpsRatio = (r.rps / baseline.rps).toFixed(2);
                    const p99Ratio = (baseline.p99 / Math.max(r.p99, 1)).toFixed(2);
                    console.log(
                        `  ${r.label.padEnd(15)}: ${rpsRatio}x rps, ${p99Ratio}x lower p99 vs class-validator`
                    );
                }
            }
            rows.push(...variantResults);
            console.log();
        }

        console.log('=== summary ===');
        console.log('variant      | server          |   rps   | mean(ms) | p50  | p95  | p99   | non-2xx');
        for (const r of rows) {
            console.log(
                `${r.variant.padEnd(12)} | ${r.label.padEnd(15)} | ${String(Math.round(r.rps)).padStart(7)} | ${r.avgLat.toFixed(2).padStart(8)} | ${String(r.p50).padStart(4)} | ${String(r.p95).padStart(4)} | ${String(r.p99).padStart(5)} | ${r.nonOk}`
            );
        }
    } finally {
        for (const { child } of procs) {
            await killServer(child);
        }
    }
}

function printRow(r: BenchResult) {
    console.log(
        `  ${r.label.padEnd(15)} rps=${String(Math.round(r.rps)).padStart(6)}  mean=${r.avgLat.toFixed(2).padStart(7)}ms  p50=${String(r.p50).padStart(4)}  p95=${String(r.p95).padStart(4)}  p99=${String(r.p99).padStart(5)}  non2xx=${r.nonOk}`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
