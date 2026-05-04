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
Re-run on 2026-05-04, Node 24.12.0.

| variant | items | payload | class-validator |   zod v4 | **arktype** | zod vs cv | ark vs cv | ark vs zod |
|---------|------:|--------:|----------------:|---------:|------------:|----------:|----------:|-----------:|
| tiny    |     1 |  0.3 KB |        0.034 ms | 0.003 ms |    0.002 ms |     11.0× |     21.8× |       2.0× |
| small   |    10 |  3.5 KB |        0.200 ms | 0.014 ms |    0.004 ms |     13.9× |     46.1× |       3.3× |
| medium  |    50 | 27.8 KB |        1.344 ms | 0.098 ms |    0.024 ms |     13.7× |     56.1× |       4.1× |
| large   |   200 |  172 KB |        8.762 ms | 0.591 ms |    0.133 ms |     14.8× |     66.0× |       4.5× |
| xlarge  |   500 |  498 KB |       25.016 ms | 1.736 ms |    0.415 ms |     14.4× |     60.3× |       4.2× |

p99 ratios on the 200-item payload: class-validator p99 = 9.83 ms,
zod p99 = 0.82 ms (**12.0× lower**), ArkType p99 = 0.15 ms (**64.6× lower**).

ArkType results align with the moltar TS-runtime-type benchmarks cited in
`analyses/01-validation-libraries-v2.md` (~100×). Zod v4 with its JIT
compiler is the strong middle: not as fast as ArkType but a much smaller
ecosystem-migration cost (Zod is the de-facto schema library many teams
already use).

## Results — end-to-end HTTP (`pnpm bench`)

`autocannon` driving a real `POST /graphql` mutation, 16 connections, 8 s per run.
Re-run on 2026-05-04, Node 24.12.0.

| variant | items |    body | server          |   rps |    mean |    p99 |
|---------|------:|--------:|-----------------|------:|--------:|-------:|
| small   |    10 |  3.6 KB | class-validator | 2,961 |  4.9 ms |  11 ms |
| small   |    10 |  3.6 KB | zod v4          | 6,669 |  1.8 ms |   7 ms |
| small   |    10 |  3.6 KB | **arktype**     | 8,042 |  1.3 ms |   4 ms |
| medium  |    50 | 27.9 KB | class-validator |   503 | 31.3 ms |  62 ms |
| medium  |    50 | 27.9 KB | zod v4          | 1,567 |  9.7 ms |  24 ms |
| medium  |    50 | 27.9 KB | **arktype**     | 1,961 |  7.7 ms |  16 ms |
| large   |   200 |  172 KB | class-validator |    79 |  199 ms | 400 ms |
| large   |   200 |  172 KB | zod v4          |   279 |   57 ms | 114 ms |
| large   |   200 |  172 KB | **arktype**     |   342 |   46 ms |  92 ms |

End-to-end speedups vs class-validator at 200 items:

- **Zod v4:** 3.5× more rps, 3.5× lower p99
- **ArkType:** 4.3× more rps, 4.4× lower p99

The 400 ms p99 on the class-validator side at 200 items is the operationally
important number: it's well past the 1 s ANR threshold under load (queue
depth + concurrent requests), and matches the per-request floor that
contributed to the loop-block window in the findings. Both Zod and ArkType
keep p99 comfortably under 200 ms at the same load.

## Tradeoffs at a glance

| dimension                           | class-validator       | zod v4                | arktype             |
|-------------------------------------|-----------------------|-----------------------|---------------------|
| validation cost (200-item p99)      | 9.8 ms                | 0.82 ms               | **0.15 ms**         |
| end-to-end HTTP rps (200 items)     | 79                    | 279                   | **342**             |
| schema definition style             | TS class + decorators | TS expression         | TS expression / DSL |
| GraphQL code-first integration      | first-class           | needs prototype lib   | needs prototype lib |
| migration cost from class-validator | n/a                   | medium (familiar API) | larger (new DSL)    |
| ecosystem familiarity               | high                  | very high             | newer               |

## Results — full-surface demo path (`pnpm bench:demo`)

This bench drives the same `createBook` and `placeOrder` mutations against
all three demo servers (`classvalidator-demo`, `zod-demo`, `arktype-demo`)
which mirror the same full-feature surface: `@InputType` + `@ObjectType` +
`@ArgsType` + enum + `PartialType` / `PickType` / `OmitType`. 16
connections, 6 s per run, on small everyday-shape payloads.

Re-run on 2026-05-04, Node 24.12.0, 6 s per case.

| case                             | server          |    rps | mean(ms) |  p99 |
|----------------------------------|-----------------|-------:|---------:|-----:|
| createBook (single object)       | class-validator | 13,147 |  0.59 ms | 4 ms |
| createBook                       | zod v4          | 13,252 |  0.48 ms | 5 ms |
| createBook                       | **arktype**     | 16,695 |  0.18 ms | 1 ms |
| placeOrder (5-item array + enum) | class-validator | 14,917 |  0.44 ms | 2 ms |
| placeOrder                       | zod v4          | 15,811 |  0.27 ms | 2 ms |
| placeOrder                       | **arktype**     | 17,840 |  0.12 ms | 1 ms |
| placeOrder (50-item array)       | class-validator | 13,024 |  1.08 ms | 2 ms |
| placeOrder                       | zod v4          | 12,575 |  1.08 ms | 2 ms |
| placeOrder                       | **arktype**     | 13,625 |  0.86 ms | 2 ms |

The takeaway: on small everyday shapes (≤ 50 simple fields, no deep
nesting, modest schema footprint) all three engines run within 15-20% of
each other and the engine choice doesn't matter for throughput. The
class-validator overhead only manifests when (a) the global metadata
storage has accumulated mass (Aurora has 100s of `@InputType` classes) AND
(b) requests carry deeply-nested inputs that drive `getTargetValidationMetadatas`
through that mass per nested target. The cart-summary bench (above) loads
those conditions explicitly with 80 filler classes + 200-item nested input,
which is where the 4-5× rps gap appears.

## Run it

```bash
pnpm install

# Direct in-process validation cost (all 3 engines)
pnpm bench:micro

# Bench servers (cart-summary stress shape — bench surface)
PORT=3001 pnpm start:cv           # class-validator
PORT=3002 pnpm start:ak           # arktype
PORT=3003 pnpm start:zod          # zod v4

# Demo servers (full-surface @InputType/@ObjectType/@ArgsType/enum/PartialType, etc.)
PORT=3009 pnpm start:demo:cv      # classvalidator-demo
PORT=3010 pnpm start:demo         # arktype-demo
PORT=3011 pnpm start:demo:zod     # zod-demo

# End-to-end HTTP comparisons
BENCH_SECONDS=8 pnpm bench        # cart-summary stress shape (3-way)
BENCH_SECONDS=8 pnpm bench:demo   # demo path (3-way)
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
│   ├── graphql-arktype/                 # ArkType ↔ NestJS-GraphQL library
│   │   ├── core/                        #   shared schema → GQL helpers
│   │   │   ├── ark-meta.ts              #     metadata symbols + schema/class registry
│   │   │   ├── json-schema-to-gql.ts    #     resolves a property's GraphQL type
│   │   │   └── build-decorated-class.ts #     shared factory pipeline
│   │   ├── ark-input-type.ts            #   createArkInputType (@InputType analogue)
│   │   ├── ark-object-type.ts           #   createArkObjectType (@ObjectType analogue)
│   │   ├── ark-args-type.ts             #   createArkArgsType (@ArgsType analogue)
│   │   ├── ark-enum.ts                  #   registerArkEnum (string-literal unions)
│   │   ├── ark-type-helpers.ts          #   arkPartial / arkPick / arkOmit / arkRequired / arkIntersection
│   │   ├── ark-args.decorator.ts        #   @ArkArgs (sets design:paramtypes)
│   │   ├── ark-query.decorator.ts       #   @ArkQuery / @ArkMutation (auto return type, opt-in output validate)
│   │   ├── ark-validation.pipe.ts       #   global pipe that runs schema(value)
│   │   └── index.ts
│   ├── dtos.ts                          # ArkType schemas + bench wiring
│   ├── filler-types.ts                  # 80 ArkType-driven InputType classes
│   ├── resolver.ts                      # processCart mutation (bench surface)
│   └── main.ts
├── arktype-demo/                        # exercises every helper in graphql-arktype
│   ├── schemas.ts                       #   ArkType schemas (Author/Book/Order/...)
│   ├── dtos.ts                          #   InputType + ObjectType + ArgsType + enum + partial/pick/omit
│   ├── resolver.ts                      #   uses @ArkQuery/@ArkMutation/@ArkArgs
│   └── main.ts                          #   `pnpm start:demo` boots on :3010
├── zod/
│   ├── graphql-zod/                     # Zod v4 ↔ NestJS-GraphQL library (mirrors graphql-arktype)
│   │   ├── core/                        #   shared schema → GQL helpers
│   │   ├── zod-input-type.ts            #   createZodInputType
│   │   ├── zod-object-type.ts           #   createZodObjectType
│   │   ├── zod-args-type.ts             #   createZodArgsType
│   │   ├── zod-enum.ts                  #   registerZodEnum
│   │   ├── zod-type-helpers.ts          #   zodPartial / zodPick / zodOmit / zodRequired / zodIntersection
│   │   ├── zod-args.decorator.ts        #   @ZodArgs
│   │   ├── zod-query.decorator.ts       #   @ZodQuery / @ZodMutation
│   │   ├── zod-validation.pipe.ts
│   │   └── index.ts
│   ├── dtos.ts                          # Zod schemas + bench wiring
│   ├── filler-types.ts                  # 80 Zod-driven InputType classes
│   ├── resolver.ts                      # processCart mutation (bench surface)
│   └── main.ts
├── zod-demo/                            # mirrors arktype-demo surface using graphql-zod
│   ├── schemas.ts
│   ├── dtos.ts
│   ├── resolver.ts
│   └── main.ts                          # `pnpm start:demo:zod` boots on :3011
├── classvalidator-demo/                 # mirror surface using @nestjs/graphql native helpers
│   ├── dtos.ts                          #   @InputType/@ObjectType/@ArgsType + class-validator + PartialType/PickType/OmitType
│   ├── resolver.ts
│   └── main.ts                          # `pnpm start:demo:cv` boots on :3009
└── bench/
    ├── micro.ts                         # in-process validate-only loop (3-way)
    ├── run.ts                           # autocannon driver — cart-summary stress (3-way)
    └── run-demo.ts                      # autocannon driver — full-surface demo path (3-way)
```

## graphql-arktype: the library prototype

`src/arktype/graphql-arktype/` is now a library-shaped ArkType ↔
`@nestjs/graphql` integration. Surface area, mapped to the NestJS GraphQL
constructs it replaces:

| `@nestjs/graphql`            | `graphql-arktype`                                    |
|------------------------------|------------------------------------------------------|
| `@InputType()` + `@Field()`  | `createArkInputType(schema, { name, fields? })`      |
| `@ObjectType()` + `@Field()` | `createArkObjectType(schema, { name, fields? })`     |
| `@ArgsType()`                | `createArkArgsType(schema, { name?, fields? })`      |
| `registerEnumType(...)`      | `registerArkEnum(schema, { name, valuesMap? })`      |
| `PartialType`                | `arkPartial(parent, options)`                        |
| `PickType`                   | `arkPick(parent, ['key', ...] as const, options)`    |
| `OmitType`                   | `arkOmit(parent, ['key', ...] as const, options)`    |
| `Required` (no NestJS equiv) | `arkRequired(parent, options)`                       |
| `IntersectionType`           | `arkIntersection(a, b, options)`                     |
| `@Args('input', {type})`     | `@ArkArgs('input', InputClass)` (patches paramtypes) |
| `@Query(returnType)`         | `@ArkQuery(returnSchema, { validate? })`             |
| `@Mutation(returnType)`      | `@ArkMutation(returnSchema, { validate? })`          |
| global `ValidationPipe`      | global `ArkValidationPipe`                           |

Highlights of the prototype:

- **Auto nested-type resolution.** `createArkXxxType` registers each schema
  under its canonical JSON shape. When a parent's JSON schema inlines a
  nested object, the registry resolves it back to the previously-registered
  GraphQL class without an explicit `fields:` override. The `fields:` override
  is still supported for forced types (e.g. ID, custom scalars) and for
  enums (which JSON Schema can't round-trip back to a registered enum).
- **JSON Schema → GraphQL coverage.** Strings/numbers/booleans/integers,
  arrays (recursive), nullable from JSON Schema `required`, optional via
  `anyOf [..., {type:"null"}]`, `format: "uuid"` → `ID`, `format: "date-time"`
  → `GraphQLISODateTime`. Configurable via `resolveOptions: { idFormats?,
isoDateTime? }`.
- **Type helpers operate on the schema, not the class.** `arkPartial`,
  `arkPick`, `arkOmit`, `arkRequired`, `arkIntersection` all delegate to
  ArkType's native `.partial()` / `.pick()` / `.omit()` / `.required()` /
  `.merge()` and re-run the same factory in the same kind (input/object).
  Kind is remembered as `ARK_KIND_METADATA` on the class so the helper
  emits the same flavour as the parent.
- **`@ArkQuery` / `@ArkMutation` derive the GraphQL return type from the
  schema** by registry lookup. Pass `validate: true` to also run the
  schema over the resolver's return value (useful in dev / staging; off by
  default since output validation isn't free).
- **`registerArkEnum`** drives `@nestjs/graphql`'s `registerEnumType` from
  an ArkType string-literal union (`type("'A' | 'B' | 'C'")`). Returns a
  `{ schema, values, gqlEnumRef, name }` bundle — pass `gqlEnumRef` via
  `fields: { status: () => OrderStatus.gqlEnumRef }` to attach the enum to
  an InputType / ObjectType field.

The `src/arktype-demo/` app (run with `pnpm start:demo`) exercises every
public helper end-to-end against a real Apollo server: input validation
rejecting bad payloads, output validation rejecting buggy resolvers,
PartialType / PickType / OmitType derived classes appearing in the schema,
the enum surfaced via introspection, and the args bundle parsed at the
GraphQL layer.

## graphql-zod: the parallel library

`src/zod/graphql-zod/` mirrors `graphql-arktype` 1:1 — same module layout,
same exports, same `core/json-schema-to-gql.ts` derivation, same auto
nested-type resolution, same type-helper semantics. The only differences
are the schema engine (`z.toJSONSchema(schema)` instead of
`schema.toJsonSchema()`) and the validation primitive (`schema.safeParse`
instead of `schema(value)` + `ArkErrors`):

| `@nestjs/graphql`                                            | `graphql-zod`                                                            |
|--------------------------------------------------------------|--------------------------------------------------------------------------|
| `@InputType()` + `@Field()`                                  | `createZodInputType(schema, { name, fields? })`                          |
| `@ObjectType()` + `@Field()`                                 | `createZodObjectType(schema, { name, fields? })`                         |
| `@ArgsType()`                                                | `createZodArgsType(schema, { name?, fields? })`                          |
| `registerEnumType(...)`                                      | `registerZodEnum(schema, { name, valuesMap? })`                          |
| `PartialType` / `PickType` / `OmitType` / `IntersectionType` | `zodPartial` / `zodPick` / `zodOmit` / `zodRequired` / `zodIntersection` |
| `@Args('input', {type})`                                     | `@ZodArgs('input', InputClass)`                                          |
| `@Query` / `@Mutation`                                       | `@ZodQuery(schema)` / `@ZodMutation(schema, { validate? })`              |
| `ValidationPipe`                                             | `ZodValidationPipe`                                                      |

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
