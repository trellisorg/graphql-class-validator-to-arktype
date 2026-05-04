// Demo-path benchmark: drives the equivalent createBook + placeOrder
// Mutations against all three demo servers (class-validator, zod, arktype)
// So we can compare the engines on a smaller, more "typical" GraphQL
// Operation shape — the cart-summary bench shows the worst-case stress
// Curve, this one shows the everyday-request-cost difference.

import autocannon from 'autocannon';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';

interface ServerSpec {
    label: string;
    port: number;
    scriptPath: string;
}

const SERVERS: ServerSpec[] = [
    { label: 'class-validator', port: 3009, scriptPath: 'src/classvalidator-demo/main.ts' },
    { label: 'zod v4', port: 3011, scriptPath: 'src/zod-demo/main.ts' },
    { label: 'arktype', port: 3010, scriptPath: 'src/arktype-demo/main.ts' },
];

const DURATION_SEC = Number(process.env.BENCH_SECONDS ?? 8);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 16);

const CASES = [
    {
        body: JSON.stringify({
            query: 'mutation($input: CreateBookInput!){ createBook(input:$input){ id title publishedYear author { id name } } }',
            variables: {
                input: {
                    title: 'Dune',
                    publishedYear: 1965,
                    authorId: '00000000-0000-4000-8000-00000000a001',
                },
            },
        }),
        label: 'createBook',
    },
    {
        body: JSON.stringify({
            query: 'mutation($input: PlaceOrderInput!){ placeOrder(input:$input){ id status totalCents } }',
            variables: {
                input: {
                    bookIds: [
                        '00000000-0000-4000-8000-00000000b001',
                        '00000000-0000-4000-8000-00000000b002',
                        '00000000-0000-4000-8000-00000000b003',
                        '00000000-0000-4000-8000-00000000b004',
                        '00000000-0000-4000-8000-00000000b005',
                    ],
                    status: 'PAID',
                    notes: 'thanks',
                },
            },
        }),
        label: 'placeOrder (5-item array + enum)',
    },
    {
        body: (() => {
            const ids: string[] = [];
            for (let i = 0; i < 50; i++) {
                ids.push(`00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`);
            }
            return JSON.stringify({
                query: 'mutation($input: PlaceOrderInput!){ placeOrder(input:$input){ id totalCents } }',
                variables: { input: { bookIds: ids, status: 'PAID', notes: '' } },
            });
        })(),
        label: 'placeOrder (50-item array)',
    },
];

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
    caseLabel: string;
    rps: number;
    p50: number;
    p95: number;
    p99: number;
    avgLat: number;
    nonOk: number;
    eventLoopLagMeanMs: number;
    eventLoopLagP99Ms: number;
    cpuPercentOfOneCore: number;
    heapUsedMB: number;
    rssMB: number;
}

interface BenchSnapshot {
    elapsedSec: number;
    eventLoopLagMeanMs: number;
    eventLoopLagP99Ms: number;
    eventLoopLagMaxMs: number;
    cpuUserMs: number;
    cpuSystemMs: number;
    cpuPercentOfOneCore: number;
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
}

async function resetStats(spec: ServerSpec): Promise<void> {
    await fetch(`http://127.0.0.1:${spec.port}/__bench/reset`, { method: 'POST' });
}

async function readStats(spec: ServerSpec): Promise<BenchSnapshot> {
    const res = await fetch(`http://127.0.0.1:${spec.port}/__bench/stats`);
    return (await res.json()) as BenchSnapshot;
}

async function runBench(spec: ServerSpec, body: string, caseLabel: string): Promise<BenchResult> {
    const url = `http://127.0.0.1:${spec.port}/graphql`;
    await resetStats(spec);
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
    const stats = await readStats(spec);
    return {
        avgLat: result.latency.average,
        caseLabel,
        cpuPercentOfOneCore: stats.cpuPercentOfOneCore,
        eventLoopLagMeanMs: stats.eventLoopLagMeanMs,
        eventLoopLagP99Ms: stats.eventLoopLagP99Ms,
        heapUsedMB: stats.heapUsedMB,
        label: spec.label,
        nonOk: result.non2xx,
        p50: result.latency.p50,
        p95: result.latency.p97_5 ?? result.latency.p95,
        p99: result.latency.p99,
        rps: result.requests.average,
        rssMB: stats.rssMB,
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
    console.log(`bench-demo: duration=${DURATION_SEC}s connections=${CONNECTIONS}`);
    console.log(`node ${process.version}`);
    console.log();

    const procs: { spec: ServerSpec; child: ChildProcess }[] = [];
    for (const spec of SERVERS) {
        procs.push({ child: await startServer(spec), spec });
    }
    console.log(`booted: ${SERVERS.map((s) => `${s.label}@${s.port}`).join(', ')}\n`);

    try {
        const rows: BenchResult[] = [];
        for (const c of CASES) {
            console.log(`---- case: ${c.label} (body ${(Buffer.byteLength(c.body) / 1024).toFixed(1)} KB) ----`);
            const variantResults: BenchResult[] = [];
            for (const { spec } of procs) {
                await warmup(spec, c.body);
                const r = await runBench(spec, c.body, c.label);
                printRow(r);
                variantResults.push(r);
            }
            const baseline = variantResults.find((r) => r.label === 'class-validator');
            if (baseline) {
                for (const r of variantResults) {
                    if (r === baseline) {
                        continue;
                    }
                    console.log(
                        `  ${r.label.padEnd(15)}: ${(r.rps / baseline.rps).toFixed(2)}x rps, ${(baseline.p99 / Math.max(r.p99, 1)).toFixed(2)}x lower p99 vs class-validator`
                    );
                }
            }
            rows.push(...variantResults);
            console.log();
        }

        console.log('=== summary ===');
        console.log(
            'case                              | server          |   rps   | mean(ms) | p99   | loop-mean | loop-p99 | cpu%  | heap MB | rss MB | non-2xx'
        );
        for (const r of rows) {
            console.log(
                `${r.caseLabel.padEnd(33)} | ${r.label.padEnd(15)} | ${String(Math.round(r.rps)).padStart(7)} | ${r.avgLat.toFixed(2).padStart(8)} | ${String(r.p99).padStart(5)} | ${r.eventLoopLagMeanMs.toFixed(2).padStart(9)} | ${r.eventLoopLagP99Ms.toFixed(2).padStart(8)} | ${r.cpuPercentOfOneCore.toFixed(1).padStart(5)} | ${r.heapUsedMB.toFixed(1).padStart(7)} | ${r.rssMB.toFixed(1).padStart(6)} | ${r.nonOk}`
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
    console.log(
        `      loop-lag mean=${r.eventLoopLagMeanMs.toFixed(2).padStart(6)}ms  p99=${r.eventLoopLagP99Ms.toFixed(2).padStart(6)}ms  cpu=${r.cpuPercentOfOneCore.toFixed(1).padStart(5)}%  heap=${r.heapUsedMB.toFixed(1)}MB  rss=${r.rssMB.toFixed(1)}MB`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
