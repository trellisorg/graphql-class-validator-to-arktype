// Direct, in-process validation benchmark across all three engines.

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { performance } from 'node:perf_hooks';
import 'reflect-metadata';

import { CartSummaryInput as CvCartSummary } from '../classvalidator/dtos';
import '../classvalidator/filler-types';

import { CartSummarySchema as ArkCartSummary } from '../arktype/dtos';
import '../arktype/filler-types';

import { CartSummarySchema as ZodCartSummary } from '../zod/dtos';
import '../zod/filler-types';

import { buildCartPayload } from '../shared/payload';

interface Variant {
    label: string;
    itemCount: number;
    tagsPerItem: number;
    sponsorsPerItem: number;
}

const VARIANTS: Variant[] = [
    { itemCount: 1, label: 'tiny', sponsorsPerItem: 0, tagsPerItem: 0 },
    { itemCount: 10, label: 'small', sponsorsPerItem: 1, tagsPerItem: 2 },
    { itemCount: 50, label: 'medium', sponsorsPerItem: 2, tagsPerItem: 4 },
    { itemCount: 200, label: 'large', sponsorsPerItem: 4, tagsPerItem: 6 },
    { itemCount: 500, label: 'xlarge', sponsorsPerItem: 4, tagsPerItem: 8 },
];

const ITERATIONS = 500;
const WARMUP = 50;

async function runClassValidator(payload: any): Promise<{ ok: boolean }> {
    const instance = plainToInstance(CvCartSummary, payload);
    const errors = await validate(instance, {
        forbidUnknownValues: true,
        whitelist: true,
    });
    return { ok: errors.length === 0 };
}

function runArktype(payload: any): { ok: boolean } {
    const out: any = (ArkCartSummary as any)(payload);
    const ok = !(out && out.summary !== undefined && Array.isArray(out));
    return { ok };
}

function runZod(payload: any): { ok: boolean } {
    const result = ZodCartSummary.safeParse(payload);
    return { ok: result.success };
}

interface Stats {
    n: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
}

function stats(samples: number[]): Stats {
    const sorted = [...samples].toSorted((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
        max: sorted[sorted.length - 1],
        mean: sum / sorted.length,
        n: sorted.length,
        p50: pct(0.5),
        p95: pct(0.95),
        p99: pct(0.99),
    };
}

async function timeAsync(fn: () => Promise<unknown>, n: number): Promise<number[]> {
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        await fn();
        samples.push(performance.now() - t0);
    }
    return samples;
}

function timeSync(fn: () => unknown, n: number): number[] {
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        fn();
        samples.push(performance.now() - t0);
    }
    return samples;
}

async function main() {
    console.log(`micro-bench: ${ITERATIONS} iterations per variant, ${WARMUP} warmup`);
    console.log(`node ${process.version} (no GraphQL, no HTTP, no NestJS DI)`);
    console.log();

    for (const variant of VARIANTS) {
        const payload = buildCartPayload({
            itemCount: variant.itemCount,
            sponsorsPerItem: variant.sponsorsPerItem,
            tagsPerItem: variant.tagsPerItem,
        });
        const payloadBytes = Buffer.byteLength(JSON.stringify(payload));

        // Warmup all three so each one's caches/JIT are primed.
        for (let i = 0; i < WARMUP; i++) {
            await runClassValidator(payload);
        }
        for (let i = 0; i < WARMUP; i++) {
            runArktype(payload);
        }
        for (let i = 0; i < WARMUP; i++) {
            runZod(payload);
        }

        const cvSamples = await timeAsync(() => runClassValidator(payload), ITERATIONS);
        const akSamples = timeSync(() => runArktype(payload), ITERATIONS);
        const zodSamples = timeSync(() => runZod(payload), ITERATIONS);

        const cv = stats(cvSamples);
        const ak = stats(akSamples);
        const zod = stats(zodSamples);

        console.log(
            `### ${variant.label.padEnd(8)} | items=${String(variant.itemCount).padStart(3)} | payload≈${(payloadBytes / 1024).toFixed(1)} KB`
        );
        printRow('class-validator', cv);
        printRow('zod v4         ', zod);
        printRow('arktype        ', ak);
        console.log(
            `  ratios (mean): zod=${(cv.mean / zod.mean).toFixed(1)}x  arktype=${(cv.mean / ak.mean).toFixed(1)}x   ` +
                `(p99): zod=${(cv.p99 / zod.p99).toFixed(1)}x  arktype=${(cv.p99 / ak.p99).toFixed(1)}x   ` +
                `arktype/zod=${(zod.mean / ak.mean).toFixed(1)}x`
        );
        console.log();
    }
}

function printRow(label: string, s: Stats) {
    console.log(
        `  ${label}  mean=${s.mean.toFixed(3)}ms  p50=${s.p50.toFixed(3)}  p95=${s.p95.toFixed(3)}  p99=${s.p99.toFixed(3)}  max=${s.max.toFixed(3)}`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
