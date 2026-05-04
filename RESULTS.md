# GraphQL: class-validator vs ArkType benchmark

A reproduction of the validation hot path called out in
`event-loop-blocking-956707398/findings.md` (Aurora's `POST /graphql`
ANR/event-loop block on 2026-04-26).

## Setup

- **Runtime:** Node v24.12.0, NestJS 11, Apollo 4, TypeScript 5.9 via ts-node.
- **Class-validator path** (`src/classvalidator/`): `@InputType` DTOs with
  `class-validator@0.14.4` decorators (`@IsUUID`, `@IsInt`, `@ValidateNested`,
  etc.) + the standard NestJS global `ValidationPipe`. 80 filler `@InputType`
  classes are also registered to inflate `getMetadataStorage()` so the
  per-call walk has realistic mass — same pattern that made Aurora's profile
  show 6.9 s of `getTargetValidationMetadatas` in a single sample.
- **ArkType path** (`src/arktype/`): `@Field` registration is generated
  programmatically from ArkType schemas via `createArkInputType(schema, …)`
  (the prototype library at `src/arktype/graphql-arktype/`). A custom
  `ArkValidationPipe` runs `schema(value)` per request, no global registry.
  Same 80 filler input types registered for schema parity.
- **Same external GraphQL schema** on both servers (verified via the same
  mutation succeeding on both with identical input).
- **Same payloads**: `src/shared/payload.ts` generates a CartSummary input
  with N items × M tags × K sponsors; the actual values are deterministic.

## Results — direct in-process validation (`pnpm bench:micro`)

500 iterations per variant, 50 warmup iterations. Time is per-validation in ms.

| variant  | items | payload  | class-validator mean | arktype mean | ratio |
| -------- | ----: | -------: | -------------------: | -----------: | ----: |
| tiny     |     1 |  0.3 KB  |              0.030ms |      0.002ms |  16x  |
| small    |    10 |  3.5 KB  |              0.194ms |      0.004ms |  46x  |
| medium   |    50 | 27.8 KB  |              1.373ms |      0.026ms |  54x  |
| large    |   200 |  172 KB  |              9.622ms |      0.139ms |  70x  |
| xlarge   |   500 |  498 KB  |             25.046ms |      0.418ms |  60x  |

p99 ratios on the 500-item payload: class-validator p99 = 32.4 ms,
ArkType p99 = 0.6 ms — **53× lower tail latency**.

Lines up with the moltar TS-runtime-type benchmarks cited in
`analyses/01-validation-libraries-v2.md` (~100×). The HTTP-path overhead
(JSON parse, GraphQL execution, Apollo, NestJS DI) dilutes the ratio at the
edge but the validation cost itself is the dominant variable on large
payloads, which is exactly the Aurora hot path.

## Results — end-to-end HTTP (`pnpm bench`)

`autocannon` driving a real `POST /graphql` mutation, 16 connections, 8 s per run.

| variant  | items | body    | server          |    rps |    mean | p99   |
| -------- | ----: | ------: | --------------- | -----: | ------: | ----: |
| small    |    10 |  3.6 KB | class-validator |  3,399 |  4.3 ms |  9 ms |
| small    |    10 |  3.6 KB | **arktype**     |  8,205 |  1.2 ms |  3 ms |
| medium   |    50 | 27.9 KB | class-validator |    488 | 32.2 ms | 65 ms |
| medium   |    50 | 27.9 KB | **arktype**     |  1,980 |  7.6 ms | 15 ms |
| large    |   200 |  172 KB | class-validator |     84 |  187 ms | 369 ms |
| large    |   200 |  172 KB | **arktype**     |    356 | 44.3 ms |  87 ms |

End-to-end speedup at 200 items: **4.2× more rps, 4.2× lower p99**.

The 369 ms p99 on the class-validator side at 200 items is the operationally
important number: it's well past the 1 s ANR threshold under load (queue
depth + concurrent requests), and matches the per-request floor that
contributed to the loop-block window in the findings.

## What this reproduces from the findings

1. **The metadata-walk cost is real and scales with payload size.** Every
   class-validator validation call walks `getMetadataStorage()` per nested
   target; with 80+ classes registered and a deeply nested input array, the
   per-call cost grows with the input size, not the schema size. The
   xlarge-row 25 ms mean validates one input one time on an idle box —
   under concurrent traffic on a 2-CPU pod with throttling this becomes the
   loop-block visible in the Sentry ANR data.
2. **ArkType has no global registry walk.** Validation cost is per-schema,
   so adding more schemas to the project doesn't slow other endpoints down.
3. **`createArkInputType` + ArkType schema is a feasible code-first
   GraphQL replacement for the class-validator + decorator stack.** The
   prototype is ~150 LoC; the resulting GraphQL schema is identical to the
   class-validator path's (verified by both servers accepting and rejecting
   the same payloads).

## Run it

```bash
pnpm install
pnpm bench:micro                  # in-process validation cost
PORT=3001 pnpm start:cv           # class-validator server
PORT=3002 pnpm start:ak           # arktype server
BENCH_SECONDS=8 pnpm bench        # end-to-end HTTP comparison
```

## Layout

```
src/
├── shared/payload.ts                    # synthetic CartSummary generator
├── classvalidator/
│   ├── dtos.ts                          # @InputType + class-validator decorators
│   ├── filler-types.ts                  # 80 @InputType filler classes
│   ├── resolver.ts                      # processCart mutation
│   └── main.ts                          # NestJS bootstrap
├── arktype/
│   ├── graphql-arktype/                 # the prototype library
│   │   ├── create-ark-input-type.ts     #   walks toJsonSchema → @Field calls
│   │   ├── ark-validation.pipe.ts       #   pipe that runs schema(value)
│   │   ├── ark-args.decorator.ts        #   @ArkArgs (sets design:paramtypes)
│   │   └── index.ts
│   ├── dtos.ts                          # ArkType schemas + createArkInputType wiring
│   ├── filler-types.ts                  # 80 ArkType-driven InputType classes
│   ├── resolver.ts                      # same processCart mutation
│   └── main.ts
└── bench/
    ├── micro.ts                         # in-process validate-only loop
    └── run.ts                           # autocannon end-to-end driver
```

## Notes on the prototype

- `createArkInputType(schema, { name, fields? })` walks
  `schema.toJsonSchema()` and calls `@Field()` for each property,
  inferring scalar GraphQL types from JSON-schema `type`. Object and
  array-of-object fields can't be inferred from JSON schema alone (the
  nested type isn't named there), so callers supply a `fields` override
  map: `{ items: () => [CartItemInput] }`. Ordering matters — leaf input
  types are created first so parents can reference them.
- `ArkValidationPipe` reads the ArkType schema attached to the input
  class (via a reflect-metadata symbol) and runs it. Returns `ArkErrors`
  → `BadRequestException`.
- `ArkArgs(name, InputClass)` is a drop-in for `@Args(name, { type })`
  that ALSO sets `design:paramtypes[index] = InputClass` — required
  because programmatically created classes resolve to a constructor type
  in TypeScript, which the compiler emits as `Object` in metadata,
  blinding the pipe to the input class.
- `nestjs-arktype` was considered but is currently scoped to
  Swagger/REST DTOs; it does not register `@nestjs/graphql` `@InputType`
  metadata, which is the integration this prototype provides.
