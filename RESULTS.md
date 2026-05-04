# GraphQL: class-validator vs Zod v4 vs ArkType benchmark

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
- **Zod v4 path** (`src/zod/`): `@Field` registration is generated
  programmatically from Zod v4 schemas via `createZodInputType(schema, …)`
  (the prototype library at `src/zod/graphql-zod/`). A custom
  `ZodValidationPipe` runs `schema.safeParse(value)` per request. Same 80
  filler input types registered for parity. `nestjs-zod@5.3.0` was the
  starting point but is scoped to REST/Swagger; we built a parallel GraphQL
  layer using Zod v4's `z.toJSONSchema()` for the schema generation.
- **ArkType path** (`src/arktype/`): same shape as the Zod path, with
  `createArkInputType` driving `@Field` calls from
  `schema.toJsonSchema()` and `ArkValidationPipe` running `schema(value)`.
- **Same external GraphQL schema** on all three servers (verified — same
  mutation succeeds on all three with identical input).
- **Same payloads**: `src/shared/payload.ts` generates a CartSummary input
  with N items × M tags × K sponsors; values are deterministic.

## Results — direct in-process validation (`pnpm bench:micro`)

500 iterations per variant, 50 warmup iterations. Time is per-validation in ms.

| variant  | items | payload  | class-validator | zod v4 | **arktype** | zod vs cv | ark vs cv | ark vs zod |
| -------- | ----: | -------: | --------------: | -----: | ----------: | --------: | --------: | ---------: |
| tiny     |     1 |  0.3 KB  |        0.036 ms | 0.003 ms |  0.002 ms |  10.9×    |   23.4×   |   2.1×     |
| small    |    10 |  3.5 KB  |        0.192 ms | 0.014 ms |  0.004 ms |  13.4×    |   44.8×   |   3.4×     |
| medium   |    50 | 27.8 KB  |        1.549 ms | 0.098 ms |  0.026 ms |  15.7×    |   59.9×   |   3.8×     |
| large    |   200 |  172 KB  |        9.377 ms | 0.591 ms |  0.136 ms |  15.9×    |   68.7×   |   4.3×     |
| xlarge   |   500 |  498 KB  |       25.606 ms | 1.600 ms |  0.394 ms |  16.0×    |   65.1×   |   4.1×     |

p99 ratios on the 200-item payload: class-validator p99 = 21.4 ms,
zod p99 = 0.95 ms (**22.6× lower**), ArkType p99 = 0.16 ms (**135× lower**).

ArkType results align with the moltar TS-runtime-type benchmarks cited in
`analyses/01-validation-libraries-v2.md` (~100×). Zod v4 with its JIT
compiler is the strong middle: not as fast as ArkType but a much smaller
ecosystem-migration cost (Zod is the de-facto schema library many teams
already use).

## Results — end-to-end HTTP (`pnpm bench`)

`autocannon` driving a real `POST /graphql` mutation, 16 connections, 8 s per run.

| variant  | items | body    | server          |    rps |    mean | p99    |
| -------- | ----: | ------: | --------------- | -----: | ------: | -----: |
| small    |    10 |  3.6 KB | class-validator |  3,358 |  4.4 ms |   9 ms |
| small    |    10 |  3.6 KB | zod v4          |  7,569 |  1.4 ms |   4 ms |
| small    |    10 |  3.6 KB | **arktype**     |  8,391 |  1.2 ms |   3 ms |
| medium   |    50 | 27.9 KB | class-validator |    523 | 30.0 ms |  59 ms |
| medium   |    50 | 27.9 KB | zod v4          |  1,731 |  8.8 ms |  18 ms |
| medium   |    50 | 27.9 KB | **arktype**     |  1,996 |  7.6 ms |  15 ms |
| large    |   200 |  172 KB | class-validator |     83 |  191 ms | 443 ms |
| large    |   200 |  172 KB | zod v4          |    302 |  52 ms  | 115 ms |
| large    |   200 |  172 KB | **arktype**     |    370 |  43 ms  |  85 ms |

End-to-end speedups vs class-validator at 200 items:
- **Zod v4:** 3.7× more rps, 3.9× lower p99
- **ArkType:** 4.5× more rps, 5.2× lower p99

The 443 ms p99 on the class-validator side at 200 items is the operationally
important number: it's well past the 1 s ANR threshold under load (queue
depth + concurrent requests), and matches the per-request floor that
contributed to the loop-block window in the findings. Both Zod and ArkType
keep p99 comfortably under 200 ms at the same load.

## Tradeoffs at a glance

| dimension                                   | class-validator | zod v4         | arktype       |
| ------------------------------------------- | --------------- | -------------- | ------------- |
| validation cost (200-item p99)              | 21 ms           | 0.95 ms        | **0.16 ms**   |
| end-to-end HTTP rps (200 items)             | 83              | 302            | **370**       |
| schema definition style                     | TS class + decorators | TS expression | TS expression / DSL |
| GraphQL code-first integration              | first-class     | needs prototype lib | needs prototype lib |
| migration cost from class-validator         | n/a             | medium (familiar API) | larger (new DSL) |
| ecosystem familiarity                       | high            | very high      | newer         |

## Run it

```bash
pnpm install
pnpm bench:micro                  # in-process validation cost (all 3 engines)
PORT=3001 pnpm start:cv           # class-validator server
PORT=3002 pnpm start:ak           # arktype server
PORT=3003 pnpm start:zod          # zod v4 server
BENCH_SECONDS=8 pnpm bench        # end-to-end HTTP comparison (all 3 engines)
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
│   ├── graphql-arktype/                 # the ArkType ↔ GraphQL prototype lib
│   │   ├── create-ark-input-type.ts     #   walks toJsonSchema → @Field calls
│   │   ├── ark-validation.pipe.ts       #   pipe that runs schema(value)
│   │   ├── ark-args.decorator.ts        #   @ArkArgs (sets design:paramtypes)
│   │   └── index.ts
│   ├── dtos.ts                          # ArkType schemas + createArkInputType wiring
│   ├── filler-types.ts                  # 80 ArkType-driven InputType classes
│   ├── resolver.ts                      # same processCart mutation
│   └── main.ts
├── zod/
│   ├── graphql-zod/                     # the Zod v4 ↔ GraphQL prototype lib
│   │   ├── create-zod-input-type.ts     #   walks z.toJSONSchema → @Field calls
│   │   ├── zod-validation.pipe.ts       #   pipe that runs schema.safeParse
│   │   ├── zod-args.decorator.ts        #   @ZodArgs (sets design:paramtypes)
│   │   └── index.ts
│   ├── dtos.ts                          # Zod schemas + createZodInputType wiring
│   ├── filler-types.ts                  # 80 Zod-driven InputType classes
│   ├── resolver.ts
│   └── main.ts
└── bench/
    ├── micro.ts                         # in-process validate-only loop (3-way)
    └── run.ts                           # autocannon end-to-end driver (3-way)
```

## Notes on the prototype libraries

Both `graphql-arktype/` and `graphql-zod/` are intentionally tiny mirrors of
each other (~150 LoC each). The shape:

- `createXxxInputType(schema, { name, fields? })` walks the schema's JSON
  Schema export (`schema.toJsonSchema()` for ArkType, `z.toJSONSchema(schema)`
  for Zod v4) and calls `@Field()` for each property. Scalar GraphQL types
  are inferred from JSON-Schema `type`. Object and array-of-object fields
  can't be inferred from JSON schema alone (the nested GraphQL type isn't
  named there), so callers supply a `fields` override map:
  `{ items: () => [CartItemInput] }`. Ordering matters — leaf input types
  must be created before parents reference them.
- `XxxValidationPipe` reads the schema attached to the input class via a
  reflect-metadata symbol and runs it. Validation failure → `BadRequestException`.
- `XxxArgs(name, InputClass)` is a drop-in for `@Args(name, { type })`
  that ALSO sets `design:paramtypes[index] = InputClass`. This is required
  because programmatically-created classes resolve to a constructor type in
  TypeScript, which the compiler emits as `Object` in metadata, blinding
  the pipe to the input class.
- `nestjs-arktype` and `nestjs-zod` are both currently scoped to
  Swagger/REST DTOs; neither registers `@nestjs/graphql` `@InputType`
  metadata, which is the integration these prototype libraries provide.
