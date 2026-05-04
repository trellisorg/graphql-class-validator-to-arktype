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

## graphql-arktype: the library prototype

`src/arktype/graphql-arktype/` is now a library-shaped ArkType ↔
`@nestjs/graphql` integration. Surface area, mapped to the NestJS GraphQL
constructs it replaces:

| `@nestjs/graphql`            | `graphql-arktype`                                      |
| ---------------------------- | ------------------------------------------------------ |
| `@InputType()` + `@Field()`  | `createArkInputType(schema, { name, fields? })`        |
| `@ObjectType()` + `@Field()` | `createArkObjectType(schema, { name, fields? })`       |
| `@ArgsType()`                | `createArkArgsType(schema, { name?, fields? })`        |
| `registerEnumType(...)`      | `registerArkEnum(schema, { name, valuesMap? })`        |
| `PartialType`                | `arkPartial(parent, options)`                          |
| `PickType`                   | `arkPick(parent, ['key', ...] as const, options)`      |
| `OmitType`                   | `arkOmit(parent, ['key', ...] as const, options)`      |
| `Required` (no NestJS equiv) | `arkRequired(parent, options)`                         |
| `IntersectionType`           | `arkIntersection(a, b, options)`                       |
| `@Args('input', {type})`     | `@ArkArgs('input', InputClass)` (patches paramtypes)   |
| `@Query(returnType)`         | `@ArkQuery(returnSchema, { validate? })`               |
| `@Mutation(returnType)`      | `@ArkMutation(returnSchema, { validate? })`            |
| global `ValidationPipe`      | global `ArkValidationPipe`                             |

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

## Notes on the Zod prototype

`src/zod/graphql-zod/` is the much-smaller proof-of-concept shape from the
benchmark — input type only, no enum / object / partial helpers. The same
expansion would apply if Zod becomes the chosen direction; the
`createXxxInputType` core in `core/build-decorated-class.ts` is intentionally
schema-engine-agnostic and a Zod variant could share it.

`nestjs-arktype` and `nestjs-zod` are both currently scoped to Swagger/REST
DTOs; neither registers `@nestjs/graphql` metadata, which is the integration
the local libraries provide.
