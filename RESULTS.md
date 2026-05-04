# GraphQL: class-validator vs Zod v4 vs ArkType benchmark

A reproduction of the validation hot path called out in
`event-loop-blocking-956707398/findings.md` (Aurora's `POST /graphql`
ANR/event-loop block on 2026-04-26), measured against three engines on
identical NestJS + Apollo servers.

## Setup

- **Runtime:** Node v24.12.0, NestJS 11, Apollo 4, TypeScript 5.9 via ts-node.
- **class-validator path** (`src/classvalidator/`, `src/classvalidator-demo/`):
  `@InputType` DTOs with `class-validator@0.14.4` decorators (`@IsUUID`,
  `@IsInt`, `@ValidateNested`, etc.) + the standard NestJS global
  `ValidationPipe`. The cart-summary surface registers 80 filler `@InputType`
  classes to inflate `getMetadataStorage()` so the per-call walk has realistic
  mass — same pattern that made Aurora's profile show 6.9 s of
  `getTargetValidationMetadatas` in a single sample.
- **Zod v4 path** (`src/zod/`, `src/zod-demo/`): `@Field` registration is
  generated programmatically from Zod v4 schemas via `createZodInputType`
  (the prototype library at `src/zod/graphql-zod/`). A custom
  `ZodValidationPipe` runs `schema.safeParse(value)` per request. Same 80
  filler input types registered for parity.
- **ArkType path** (`src/arktype/`, `src/arktype-demo/`): same shape as the
  Zod path, with `createArkInputType` driving `@Field` calls from
  `schema.toJsonSchema()` and `ArkValidationPipe` running `schema(value)`.
- **Same external GraphQL schema** on all three servers (verified — the same
  mutation succeeds on all three with identical input).
- **Same payloads:** `src/shared/payload.ts` generates a CartSummary input
  with N items × M tags × K sponsors; values are deterministic.

## What's measured

Each server mounts `mountBenchStats(app)` (`src/shared/bench-stats.ts`),
which exposes `GET /__bench/stats` and `POST /__bench/reset`. The bench
harness resets stats before each run and samples them after `autocannon`
finishes. Per-engine, per-scenario we capture:

| metric                          | source                                              |
|---------------------------------|-----------------------------------------------------|
| rps, mean / p50 / p95 / p99     | `autocannon` summary                                |
| event loop lag (mean, p99, max) | `node:perf_hooks` `monitorEventLoopDelay({res:10})` |
| CPU % of one core               | `process.cpuUsage()` deltas / wall-clock           |
| heap used (MB)                  | `process.memoryUsage().heapUsed`                    |
| RSS (MB)                        | `process.memoryUsage().rss`                         |
| non-2xx                         | `autocannon` non2xx counter                         |

## Results — cart-summary stress (`pnpm bench`)

`autocannon` driving a real `POST /graphql` mutation against the cart-summary
resolver (the deeply-nested validation hot path), 16 connections, 10 s per
run. Same shape as the Aurora finding — large nested input + 80 filler
`@InputType` classes loaded so class-validator's metadata storage has mass.

Run on 2026-05-04, Node 24.12.0.

| variant     | server          |    rps | mean(ms) |  p99 | loop-mean | loop-p99 |  cpu% | heap MB | rss MB | non-2xx |
|-------------|-----------------|-------:|---------:|-----:|----------:|---------:|------:|--------:|-------:|--------:|
| small (10)  | class-validator |  3,215 |     4.51 |   10 |     12.74 |    15.94 | 105.3 |    68.1 |  329.5 |       0 |
| small       | zod v4          |  7,612 |     1.42 |    4 |     10.56 |    12.14 | 106.2 |   108.5 |  327.4 |       0 |
| small       | **arktype**     |  8,542 |     1.21 |    3 |     10.41 |    11.81 | 105.8 |   108.5 |  295.7 |       0 |
| medium (50) | class-validator |    506 |    31.05 |   62 |     29.72 |    42.40 | 102.8 |   113.4 |  325.5 |       0 |
| medium      | zod v4          |  1,707 |     8.87 |   18 |     16.62 |    19.43 | 100.2 |    77.1 |  311.7 |       0 |
| medium      | **arktype**     |  1,921 |     7.88 |   17 |     15.18 |    20.28 |  99.4 |    97.3 |  315.0 |       0 |
| large (200) | class-validator |     81 |   195.47 |  386 |    184.72 |   265.81 | 103.0 |    59.9 |  290.2 |       0 |
| large       | zod v4          |    309 |    51.14 |  105 |     48.28 |    59.67 | 100.8 |    78.2 |  312.6 |       0 |
| large       | **arktype**     |    370 |    42.67 |   86 |     39.97 |    51.58 | 100.4 |    74.0 |  316.7 |       0 |

End-to-end speedups vs class-validator at 200 items:

- **Zod v4:** 3.81× rps, 3.68× lower p99
- **ArkType:** 4.57× rps, 4.49× lower p99

The operationally important number is **event-loop p99**. At 200 items
class-validator's loop p99 is **266 ms** — the loop is *blocked* a quarter
of a second under sustained load, which is exactly the floor that
contributed to the ANR window in the findings. ArkType holds loop p99 to
**52 ms** and Zod v4 to **60 ms** under the same load.

## Results — full-surface demo path (`pnpm bench:demo`)

Same `autocannon` driver, 16 connections, 8 s per run, against the demo
servers (`classvalidator-demo`, `zod-demo`, `arktype-demo`) which mirror the
same full feature surface: `@InputType` + `@ObjectType` + `@ArgsType` +
enum + `PartialType` / `PickType` / `OmitType` + interface + union +
connection (Relay-style) + cursor-paginated args + subscription. Three
everyday request shapes.

Run on 2026-05-04, Node 24.12.0.

| case                             | server          |    rps | mean(ms) | p99 | loop-mean | loop-p99 |  cpu% | heap MB | rss MB | non-2xx |
|----------------------------------|-----------------|-------:|---------:|----:|----------:|---------:|------:|--------:|-------:|--------:|
| createBook                       | class-validator | 15,640 |     0.24 |   2 |     10.05 |    11.35 | 109.4 |   109.7 |  339.1 |       0 |
| createBook                       | zod v4          | 16,472 |     0.17 |   1 |     10.03 |    10.93 | 108.9 |    64.9 |  315.4 |       0 |
| createBook                       | **arktype**     | 16,932 |     0.15 |   1 |     10.05 |    11.14 | 108.9 |    91.3 |  331.1 |       0 |
| placeOrder (5-item array + enum) | class-validator | 15,122 |     0.35 |   2 |     10.05 |    11.12 | 108.8 |    80.3 |  282.4 |       0 |
| placeOrder (5-item array + enum) | zod v4          | 15,768 |     0.21 |   2 |     10.06 |    11.38 | 106.2 |    76.3 |  274.1 |       0 |
| placeOrder (5-item array + enum) | **arktype**     | 16,675 |     0.15 |   2 |     10.05 |    11.21 | 101.9 |    82.9 |  304.6 |       0 |
| placeOrder (50-item array)       | class-validator | 12,633 |     1.08 |   2 |     10.19 |    11.14 | 102.5 |   105.1 |  293.2 |       0 |
| placeOrder (50-item array)       | zod v4          | 12,323 |     1.08 |   2 |     10.20 |    11.19 | 100.9 |    74.9 |  281.9 |       0 |
| placeOrder (50-item array)       | **arktype**     | 13,821 |     0.90 |   2 |     10.10 |    11.33 | 100.9 |    91.6 |  302.0 |       0 |

On small everyday shapes (≤ 50 simple fields, no deep nesting, modest
schema footprint) all three engines run within ~10% of each other and the
engine choice doesn't matter for throughput. The class-validator overhead
only manifests when (a) the global metadata storage has accumulated mass
(Aurora has 100s of `@InputType` classes) AND (b) requests carry
deeply-nested inputs that drive `getTargetValidationMetadatas` through
that mass per nested target. The cart-summary bench above loads those
conditions explicitly with 80 filler classes + 200-item nested input,
which is where the 4-5× rps gap appears.

## Tradeoffs at a glance

| dimension                           | class-validator       | zod v4                | arktype             |
|-------------------------------------|-----------------------|-----------------------|---------------------|
| 200-item rps (cart-summary)         | 81                    | 309                   | **370**             |
| 200-item p99                        | 386 ms                | 105 ms                | **86 ms**           |
| 200-item event-loop p99             | 266 ms                | 60 ms                 | **52 ms**           |
| schema definition style             | TS class + decorators | TS expression         | TS expression / DSL |
| GraphQL code-first integration      | first-class           | needs prototype lib   | needs prototype lib |
| migration cost from class-validator | n/a                   | medium (familiar API) | larger (new DSL)    |
| ecosystem familiarity               | high                  | very high             | newer               |

## Run it

```bash
pnpm install

# Bench servers (cart-summary stress shape)
PORT=3001 pnpm start:cv           # class-validator
PORT=3002 pnpm start:ak           # arktype
PORT=3003 pnpm start:zod          # zod v4

# Demo servers (full-surface @InputType/@ObjectType/@ArgsType/enum/PartialType, etc.)
PORT=3009 pnpm start:demo:cv      # classvalidator-demo
PORT=3010 pnpm start:demo         # arktype-demo
PORT=3011 pnpm start:demo:zod     # zod-demo

# End-to-end HTTP comparisons
pnpm bench                        # cart-summary stress shape (3-way)
pnpm bench:demo                   # demo path (3-way)

# Override durations / load:
BENCH_SECONDS=20 BENCH_CONNECTIONS=32 pnpm bench
```

Each bench script boots the three servers, resets `/__bench/stats` before
each run, drives autocannon, samples the stats endpoint after, and prints
a summary table.

## Layout

```
src/
├── shared/
│   ├── payload.ts                      # synthetic CartSummary generator
│   └── bench-stats.ts                  # event-loop / CPU / heap instrumentation
├── classvalidator/
│   ├── dtos.ts                         # @InputType + class-validator decorators
│   ├── filler-types.ts                 # 80 @InputType filler classes
│   ├── resolver.ts                     # processCart mutation
│   └── main.ts                         # NestJS bootstrap (:3001)
├── arktype/
│   ├── graphql-arktype/                # ArkType ↔ NestJS-GraphQL library
│   │   ├── core/
│   │   │   ├── ark-meta.ts             #   metadata symbols + schema/class registry
│   │   │   ├── json-schema-to-gql.ts   #   resolves a property's GraphQL type
│   │   │   └── build-decorated-class.ts#   shared factory pipeline
│   │   ├── ark-input-type.ts           # createArkInputType
│   │   ├── ark-object-type.ts          # createArkObjectType
│   │   ├── ark-args-type.ts            # createArkArgsType
│   │   ├── ark-interface-type.ts       # createArkInterfaceType
│   │   ├── ark-union.ts                # createArkUnion
│   │   ├── ark-connection.ts           # createArkConnectionType (Relay-style)
│   │   ├── ark-cursor-paginated-args.ts# createArkCursorPaginatedArgsType
│   │   ├── ark-enum.ts                 # registerArkEnum
│   │   ├── ark-type-helpers.ts         # arkPartial / arkPick / arkOmit / arkRequired / arkIntersection
│   │   ├── ark-field-helpers.ts        # arkId / arkIdArray / arkIdFields
│   │   ├── ark-args.decorator.ts       # @ArkArgs (sets design:paramtypes)
│   │   ├── ark-query.decorator.ts      # @ArkQuery / @ArkMutation / @ArkSubscription
│   │   ├── ark-validation.pipe.ts      # global pipe that runs schema(value)
│   │   └── index.ts
│   ├── dtos.ts                         # ArkType schemas + bench wiring
│   ├── filler-types.ts                 # 80 ArkType-driven InputType classes
│   ├── resolver.ts                     # processCart mutation (bench surface)
│   └── main.ts                         # :3002
├── arktype-demo/                       # exercises every helper in graphql-arktype
│   ├── schemas.ts                      #   ArkType schemas (Author/Book/Order/...)
│   ├── dtos.ts                         #   InputType + ObjectType + ArgsType + enum + partial/pick/omit
│   ├── resolver.ts                     #   uses @ArkQuery/@ArkMutation/@ArkArgs/@ArkSubscription
│   └── main.ts                         #   :3010
├── zod/
│   ├── graphql-zod/                    # Zod v4 ↔ NestJS-GraphQL library (mirrors graphql-arktype)
│   │   ├── core/                       #   shared schema → GQL helpers
│   │   ├── zod-input-type.ts           # createZodInputType
│   │   ├── zod-object-type.ts          # createZodObjectType
│   │   ├── zod-args-type.ts            # createZodArgsType
│   │   ├── zod-enum.ts                 # registerZodEnum
│   │   ├── zod-type-helpers.ts         # zodPartial / zodPick / zodOmit / zodRequired / zodIntersection
│   │   ├── zod-args.decorator.ts       # @ZodArgs
│   │   ├── zod-query.decorator.ts      # @ZodQuery / @ZodMutation
│   │   ├── zod-validation.pipe.ts
│   │   └── index.ts
│   ├── dtos.ts                         # Zod schemas + bench wiring
│   ├── filler-types.ts                 # 80 Zod-driven InputType classes
│   ├── resolver.ts                     # processCart mutation (bench surface)
│   └── main.ts                         # :3003
├── zod-demo/                           # mirrors arktype-demo surface using graphql-zod
│   ├── schemas.ts
│   ├── dtos.ts
│   ├── resolver.ts
│   └── main.ts                         # :3011
├── classvalidator-demo/                # mirror surface using @nestjs/graphql native helpers
│   ├── dtos.ts                         #   @InputType/@ObjectType/@ArgsType + class-validator + PartialType/PickType/OmitType
│   ├── resolver.ts
│   └── main.ts                         # :3009
└── bench/
    ├── run.ts                          # autocannon driver — cart-summary stress (3-way)
    └── run-demo.ts                     # autocannon driver — full-surface demo path (3-way)
```

## graphql-arktype: the library prototype

`src/arktype/graphql-arktype/` is a library-shaped ArkType ↔
`@nestjs/graphql` integration. Surface area, mapped to the NestJS GraphQL
constructs it replaces:

| `@nestjs/graphql`            | `graphql-arktype`                                    |
|------------------------------|------------------------------------------------------|
| `@InputType()` + `@Field()`  | `createArkInputType(schema, { name, fields? })`      |
| `@ObjectType()` + `@Field()` | `createArkObjectType(schema, { name, fields? })`     |
| `@ArgsType()`                | `createArkArgsType(schema, { name?, fields? })`      |
| `@InterfaceType()`           | `createArkInterfaceType(schema, { name, resolveType?, isAbstract? })` |
| `createUnionType(...)`       | `createArkUnion(members, { name, resolveType? })`    |
| `registerEnumType(...)`      | `registerArkEnum(schema, { name, valuesMap? })`      |
| Relay Connection / Edge      | `createArkConnectionType(NodeClass, name)`           |
| cursor-paginated `@ArgsType` | `createArkCursorPaginatedArgsType(extraSchema?, options)` |
| `PartialType`                | `arkPartial(parent, options)`                        |
| `PickType`                   | `arkPick(parent, ['key', ...] as const, options)`    |
| `OmitType`                   | `arkOmit(parent, ['key', ...] as const, options)`    |
| `Required` (no NestJS equiv) | `arkRequired(parent, options)`                       |
| `IntersectionType`           | `arkIntersection(a, b, options)`                     |
| `ID` field forcing           | `arkId` / `arkIdArray` / `arkIdFields(...names)`     |
| `@Args('input', {type})`     | `@ArkArgs('input', InputClass)` (patches paramtypes) |
| `@Query(returnType)`         | `@ArkQuery(returnSchema, { validate? })`             |
| `@Mutation(returnType)`      | `@ArkMutation(returnSchema, { validate? })`          |
| `@Subscription(returnType)`  | `@ArkSubscription(returnSchema, options)`            |
| global `ValidationPipe`      | global `ArkValidationPipe`                           |

Highlights of the prototype:

- **Auto nested-type resolution.** `createArkXxxType` registers each schema
  under its canonical JSON shape. When a parent's JSON schema inlines a
  nested object, the registry resolves it back to the previously-registered
  GraphQL class without an explicit `fields:` override. The override is
  still supported for forced types (e.g. ID, custom scalars) and for enums
  (which JSON Schema can't round-trip back to a registered enum).
- **JSON Schema → GraphQL coverage.** Strings/numbers/booleans/integers,
  arrays (recursive), nullable from JSON Schema `required`, optional via
  `anyOf [..., {type:"null"}]`, `format: "uuid"` → `ID`,
  `format: "date-time"` → `GraphQLISODateTime`, `default` → `@Field({ defaultValue })`.
  Configurable via `resolveOptions: { idFormats?, isoDateTime?, formatToScalar? }`.
- **Type helpers operate on the schema, not the class.** `arkPartial`,
  `arkPick`, `arkOmit`, `arkRequired`, `arkIntersection` all delegate to
  ArkType's native `.partial()` / `.pick()` / `.omit()` / `.required()` /
  `.merge()` and re-run the same factory in the same kind (input/object/args/interface).
  Kind is remembered as `ARK_KIND_METADATA` on the class so the helper
  emits the same flavour as the parent.
- **`@ArkQuery` / `@ArkMutation` / `@ArkSubscription` derive the GraphQL
  return type from the schema** by registry lookup. Pass `validate: true`
  to also run the schema over the resolver's return value (useful in dev /
  staging; off by default since output validation isn't free).
- **`registerArkEnum`** drives `@nestjs/graphql`'s `registerEnumType` from
  an ArkType string-literal union (`type("'A' | 'B' | 'C'")`). Returns a
  `{ schema, values, gqlEnumRef, name }` bundle — pass `gqlEnumRef` via
  `fields: { status: () => OrderStatus.gqlEnumRef }` to attach the enum to
  an InputType / ObjectType field.
- **Unions and interfaces** ship with default `resolveType` discriminators
  that validate the candidate value against each member's attached schema
  and return the first match. Override via `resolveType` in the options.
- **Relay Connection / cursor pagination** are baked in: `createArkConnectionType`
  emits the `{ edges: [Edge!]!, pageInfo: PageInfo! }` shape with a shared
  `PageInfo` singleton; `createArkCursorPaginatedArgsType` produces
  `@ArgsType` with `first`, `last`, `before`, `after` plus any extra schema
  you `.and(...)` in. `defaultFirst` and `maxPageSize` flow through via the
  schema's `default` and `atMost` constraints.

The `src/arktype-demo/` app (`pnpm start:demo`) exercises every public
helper end-to-end against a real Apollo server: input validation rejecting
bad payloads, output validation rejecting buggy resolvers, PartialType /
PickType / OmitType derived classes appearing in the schema, the enum
surfaced via introspection, the args bundle parsed at the GraphQL layer,
interface and union types resolving correctly, paginated queries returning
Connections with valid PageInfo, and subscriptions registered and pushing
events.

## graphql-zod: the parallel library

`src/zod/graphql-zod/` mirrors `graphql-arktype` 1:1 — same module layout,
same exports, same `core/json-schema-to-gql.ts` derivation, same auto
nested-type resolution, same type-helper semantics. The only differences
are the schema engine (`z.toJSONSchema(schema)` instead of
`schema.toJsonSchema()`) and the validation primitive (`schema.safeParse`
instead of `schema(value)` + `ArkErrors`).

`src/zod-demo/` exercises every helper end-to-end and mirrors
`src/arktype-demo/` line-for-line so the cross-engine comparison is
apples-to-apples.

## Notes

- `nestjs-arktype` and `nestjs-zod` are both currently scoped to Swagger/REST
  DTOs; neither registers `@nestjs/graphql` metadata, which is the integration
  the local libraries provide.
- `src/classvalidator-demo/` uses NestJS's native `PartialType` / `PickType` /
  `OmitType` (from `@nestjs/graphql`) and `class-validator` decorators on
  hand-written `@InputType` / `@ObjectType` classes — the conventional,
  pre-library shape against which both prototypes are measured.
- `cpu%` numbers are the share of *one* CPU core consumed by the server
  process during the run; > 100 % means the server is using more than a
  single core (V8 GC / libuv threadpool / etc.). It's a relative comparison
  — autocannon and the bench stats endpoint also consume CPU on the same
  machine, so absolute values aren't a benchmark of the engine in isolation.
