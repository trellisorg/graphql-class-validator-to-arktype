// Direct, in-process validation benchmark. Bypasses HTTP/GraphQL/Apollo to
// isolate the cost of `class-validator.validate()` vs `arkSchema(value)` on
// the same payload, after both globals have been warmed.

import 'reflect-metadata';
import { performance } from 'node:perf_hooks';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CartSummaryInput as CvCartSummary } from '../classvalidator/dtos';
import '../classvalidator/filler-types';

import { CartSummarySchema } from '../arktype/dtos';
import '../arktype/filler-types';

import { buildCartPayload } from '../shared/payload';

interface Variant {
  label: string;
  itemCount: number;
  tagsPerItem: number;
  sponsorsPerItem: number;
}

const VARIANTS: Variant[] = [
  { label: 'tiny',    itemCount:   1, tagsPerItem: 0, sponsorsPerItem: 0 },
  { label: 'small',   itemCount:  10, tagsPerItem: 2, sponsorsPerItem: 1 },
  { label: 'medium',  itemCount:  50, tagsPerItem: 4, sponsorsPerItem: 2 },
  { label: 'large',   itemCount: 200, tagsPerItem: 6, sponsorsPerItem: 4 },
  { label: 'xlarge',  itemCount: 500, tagsPerItem: 8, sponsorsPerItem: 4 },
];

const ITERATIONS = 500;
const WARMUP = 50;

async function runClassValidator(payload: any): Promise<{ ok: boolean }> {
  const instance = plainToInstance(CvCartSummary, payload);
  const errors = await validate(instance, {
    whitelist: true,
    forbidUnknownValues: true,
  });
  return { ok: errors.length === 0 };
}

function runArktype(payload: any): { ok: boolean } {
  const out: any = (CartSummarySchema as any)(payload);
  // ArkErrors instance check — but checking the constructor symbol is enough
  // to discriminate; for the bench we just want the work done.
  const ok = !(out && out.summary !== undefined && Array.isArray(out));
  return { ok };
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    n: sorted.length,
    mean: sum / sorted.length,
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
    max: sorted[sorted.length - 1],
  };
}

async function main() {
  console.log(`micro-bench: ${ITERATIONS} iterations per variant, ${WARMUP} warmup`);
  console.log(`node ${process.version} (no GraphQL, no HTTP, no NestJS DI)`);
  console.log();

  for (const variant of VARIANTS) {
    const payload = buildCartPayload({
      itemCount: variant.itemCount,
      tagsPerItem: variant.tagsPerItem,
      sponsorsPerItem: variant.sponsorsPerItem,
    });
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload));

    // ---------- class-validator ----------
    for (let i = 0; i < WARMUP; i++) await runClassValidator(payload);
    const cvSamples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      const r = await runClassValidator(payload);
      const t1 = performance.now();
      cvSamples.push(t1 - t0);
      if (!r.ok) throw new Error('class-validator unexpectedly rejected the payload');
    }
    const cv = stats(cvSamples);

    // ---------- arktype ----------
    for (let i = 0; i < WARMUP; i++) runArktype(payload);
    const akSamples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      const r = runArktype(payload);
      const t1 = performance.now();
      akSamples.push(t1 - t0);
      if (!r.ok) throw new Error('arktype unexpectedly rejected the payload');
    }
    const ak = stats(akSamples);

    console.log(`### ${variant.label.padEnd(8)} | items=${String(variant.itemCount).padStart(3)} | payload≈${(payloadBytes/1024).toFixed(1)} KB`);
    console.log(
      `  class-validator  mean=${cv.mean.toFixed(3)}ms  p50=${cv.p50.toFixed(3)}  p95=${cv.p95.toFixed(3)}  p99=${cv.p99.toFixed(3)}  max=${cv.max.toFixed(3)}`,
    );
    console.log(
      `  arktype          mean=${ak.mean.toFixed(3)}ms  p50=${ak.p50.toFixed(3)}  p95=${ak.p95.toFixed(3)}  p99=${ak.p99.toFixed(3)}  max=${ak.max.toFixed(3)}`,
    );
    console.log(
      `  ratio (cv / ak)  mean=${(cv.mean / ak.mean).toFixed(1)}x  p99=${(cv.p99 / ak.p99).toFixed(1)}x`,
    );
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
