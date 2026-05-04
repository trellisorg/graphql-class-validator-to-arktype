import type { INestApplication } from '@nestjs/common';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

/**
 * Per-process runtime stats surfaced over `/__bench/stats` so the autocannon-based bench harness can attribute
 * event-loop pressure, CPU time, and heap pressure to each validation engine. Numbers are deltas relative to the
 * last `?reset=1` sample; the harness resets immediately before each variant run and reads after the run
 * completes.
 */

let histogram: IntervalHistogram | null = null;
let lastCpu: NodeJS.CpuUsage = { system: 0, user: 0 };
let lastReset = process.hrtime.bigint();

export interface BenchSnapshot {
    /** Wall-clock seconds between the previous reset and this snapshot. */
    elapsedSec: number;
    /** Mean event loop delay observed during the window, in ms. */
    eventLoopLagMeanMs: number;
    /** p99 event loop delay during the window, in ms. */
    eventLoopLagP99Ms: number;
    /** Worst observed event loop delay during the window, in ms. */
    eventLoopLagMaxMs: number;
    /** User-mode CPU time accumulated since reset, in ms. */
    cpuUserMs: number;
    /** Kernel-mode CPU time accumulated since reset, in ms. */
    cpuSystemMs: number;
    /** Approximate CPU utilisation across the window: (user + sys) / wall, in percent of one core. */
    cpuPercentOfOneCore: number;
    /** Heap currently allocated by V8, in MB (snapshot, not delta). */
    heapUsedMB: number;
    /** Heap reserved by V8, in MB (snapshot, not delta). */
    heapTotalMB: number;
    /** Resident set size, in MB (snapshot, not delta). */
    rssMB: number;
}

function snapshot(): BenchSnapshot {
    if (!histogram) {
        throw new Error('bench-stats: histogram not initialised — call mountBenchStats(app) at boot');
    }
    const now = process.hrtime.bigint();
    const elapsedSec = Number(now - lastReset) / 1e9;
    const cpu = process.cpuUsage(lastCpu);
    const mem = process.memoryUsage();
    const userMs = cpu.user / 1000;
    const sysMs = cpu.system / 1000;
    return {
        cpuPercentOfOneCore: elapsedSec > 0 ? ((userMs + sysMs) / (elapsedSec * 1000)) * 100 : 0,
        cpuSystemMs: sysMs,
        cpuUserMs: userMs,
        elapsedSec,
        eventLoopLagMaxMs: histogram.max / 1e6,
        eventLoopLagMeanMs: histogram.mean / 1e6,
        eventLoopLagP99Ms: histogram.percentile(99) / 1e6,
        heapTotalMB: mem.heapTotal / 1024 / 1024,
        heapUsedMB: mem.heapUsed / 1024 / 1024,
        rssMB: mem.rss / 1024 / 1024,
    };
}

function reset(): void {
    histogram?.reset();
    lastCpu = process.cpuUsage();
    lastReset = process.hrtime.bigint();
}

/**
 * Wire `/__bench/stats` and `/__bench/reset` onto the running Nest application. Idempotent: calling twice will
 * simply re-register the routes (Express tolerates this).
 *
 * - `GET /__bench/stats` — returns the current snapshot. Pass `?reset=1` to atomically read+reset.
 * - `POST /__bench/reset` — resets all counters; useful before warmup.
 */
export function mountBenchStats(app: INestApplication): void {
    if (!histogram) {
        // 10ms resolution is the sweet spot — fine enough to detect coarse stalls, not so fine that the
        // histogram itself perturbs the loop.
        histogram = monitorEventLoopDelay({ resolution: 10 });
        histogram.enable();
        reset();
    }
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.get('/__bench/stats', (req: { query?: Record<string, string> }, res: { json: (body: unknown) => void }) => {
        const snap = snapshot();
        if (req.query?.reset === '1') {
            reset();
        }
        res.json(snap);
    });
    httpAdapter.post('/__bench/reset', (_req: unknown, res: { json: (body: unknown) => void }) => {
        reset();
        res.json({ ok: true });
    });
}
