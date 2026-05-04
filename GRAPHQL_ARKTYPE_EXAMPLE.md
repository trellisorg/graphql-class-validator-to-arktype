# `graphql-arktype` — End-to-end example

A complete walkthrough of building a NestJS GraphQL API where every type, every input, and every resolver argument is derived from an [ArkType](https://arktype.io/) schema. One source of truth for the runtime shape, the GraphQL schema, and the validation rules.

The example domain is a tiny library API with `Author`, `Book`, and `Tag`.

---

## 1. Install

```bash
pnpm add @nestjs/graphql @nestjs/apollo @apollo/server graphql arktype reflect-metadata
```

The library lives in `src/arktype/graphql-arktype` and exports:

```ts
import {
    // Type factories
    createArkObjectType,
    createArkInputType,
    createArkArgsType,

    // Enums
    registerArkEnum,
    validateArkEnum,

    // NestJS PartialType / PickType / OmitType / IntersectionType / RequiredType
    arkPartial,
    arkPick,
    arkOmit,
    arkIntersection,
    arkRequired,

    // Field-override helpers (force a property to GraphQL `ID`)
    arkId,
    arkIdArray,
    arkIdFields,

    // Resolver-side
    ArkArgs,
    ArkQuery,
    ArkMutation,
    ArkValidationPipe,
} from './arktype/graphql-arktype';
```

`reflect-metadata` must be imported once at startup (or at the top of test files):

```ts
import 'reflect-metadata';
```

---

## 2. Define domain schemas in ArkType

ArkType schemas are written once and serve three purposes: TypeScript inference, runtime validation, and GraphQL field derivation.

```ts
import { type } from 'arktype';

const TagFormatSchema = type("'PHYSICAL' | 'EBOOK' | 'AUDIOBOOK'");

const TagSchema = type({
    id: 'string.uuid.v4',
    name: 'string > 0 & string <= 64',
    format: TagFormatSchema,
});

const AuthorSchema = type({
    id: 'string.uuid.v4',
    name: 'string > 0 & string <= 256',
});

const BookSchema = type({
    id: 'string.uuid.v4',
    title: 'string > 0 & string <= 512',
    authorId: 'string.uuid.v4',
    // Validated by the pipe but hidden from the GraphQL schema:
    internalRowId: 'string > 0',
});

const CreateAuthorInputSchema = type({
    name: 'string > 0 & string <= 256',
});

const CreateBookInputSchema = type({
    authorId: 'string.uuid.v4',
    title: 'string > 0 & string <= 512',
    tagIds: type('string.uuid.v4').array().atLeastLength(0).atMostLength(50),
});
```

How the JSON form of each property maps to GraphQL:

| ArkType                     | JSON Schema                          | GraphQL                |
| --------------------------- | ------------------------------------ | ---------------------- |
| `'string.uuid.v4'`          | `{ type: 'string', format: 'uuid' }` | `ID`                   |
| `'string > 0'`              | `{ type: 'string' }`                 | `String`               |
| `'string.email'`            | `{ type: 'string', format: 'email' }`| `String`               |
| `'number.integer'`          | `{ type: 'integer' }`                | `Int`                  |
| `'number'`                  | `{ type: 'number' }`                 | `Float`                |
| `'boolean'`                 | `{ type: 'boolean' }`                | `Boolean`              |
| `Date.iso` / date-time fmt  | `{ type: 'string', format: 'date-time' }` | `GraphQLISODateTime` |
| `string-literal union`      | `{ enum: [...] }`                    | `String` (use `registerArkEnum` for a real enum) |
| `arr.array()`               | `{ type: 'array', items: ... }`      | `[Inner]`              |

The `idFormats` option (default `new Set(['uuid'])`) controls which `format` values map to `ID`. Override per-factory if you need other formats.

---

## 3. Generate GraphQL `@ObjectType` / `@InputType` classes

```ts
const TagFormat = registerArkEnum(TagFormatSchema, { name: 'TagFormat' });

const Tag = createArkObjectType(TagSchema, {
    name: 'Tag',
    fields: { format: () => TagFormat.gqlEnumRef },
});

const Author = createArkObjectType(AuthorSchema, { name: 'Author' });

const Book = createArkObjectType(BookSchema, {
    name: 'Book',
    fields: { internalRowId: { hidden: true } },
});

const CreateAuthorInput = createArkInputType(CreateAuthorInputSchema, {
    name: 'CreateAuthorInput',
});

const CreateBookInput = createArkInputType(CreateBookInputSchema, {
    name: 'CreateBookInput',
});
```

Each factory returns a NestJS class — `new () => T['infer']` — that's been decorated with `@ObjectType()`/`@InputType()` plus a `@Field()` per property. The original ArkType schema is stamped onto the class so the validation pipe can re-read it later.

### `fields` overrides — five accepted shapes

The `fields` map is for properties that JSON Schema can't carry enough information about (object refs, arrays of objects, custom scalars):

| Shape | Example | Use case |
| --- | --- | --- |
| Class | `tags: TagInput` | Bare class reference |
| Array of class | `tags: [TagInput]` | Array of a known class |
| Thunk | `tags: () => [TagInput]` | Forward-reference / deferred lookup |
| `{ type, nullable }` | `tags: { type: () => [TagInput], nullable: false }` | Force nullability |
| `{ hidden: true }` | `internalRowId: { hidden: true }` | Validate but hide from schema |

### Prefixed / non-UUID IDs

If you don't use UUIDs, the inferred GraphQL type is `String`, not `ID`. Force the mapping with the helper:

```ts
import { arkId, arkIdArray, arkIdFields } from './arktype/graphql-arktype';

const Book = createArkObjectType(BookSchema, {
    name: 'Book',
    fields: {
        ...arkIdFields('id', 'authorId'),
        tagIds: arkIdArray,
    },
});
```

The validation rule for the prefixed format goes in the schema itself:

```ts
const PrefixedIdSchema = type('string').narrow(
    (s, ctx) => /^[a-z]+_[0-9A-Za-z]{11}$/.test(s) || ctx.mustBe('a prefixed id like fun_abc12345xyz')
);

const BookSchema = type({
    id: PrefixedIdSchema,
    authorId: PrefixedIdSchema,
    title: 'string > 0',
});
```

---

## 4. Resolvers

`@ArkQuery` / `@ArkMutation` derive the GraphQL return type from the registered class automatically. `@ArkArgs` is a drop-in for `@Args` that also patches `design:paramtypes` so the validation pipe sees the right metatype.

```ts
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import {
    ArkArgs,
    ArkMutation,
    ArkQuery,
} from './arktype/graphql-arktype';

@Resolver(() => Book)
class BookResolver {
    constructor(private readonly store: LibraryStore) {}

    @ArkQuery(BookSchema, { name: 'book', nullable: true })
    getBook(@ArkArgs('id', /* primitive arg */ String as any) id: string): BookRow | null {
        return this.store.books.get(id) ?? null;
    }

    @ArkMutation(BookSchema, { name: 'createBook', validate: true })
    createBook(
        @ArkArgs('input', CreateBookInput) input: typeof CreateBookInputSchema.infer
    ): BookRow {
        const id = newId();
        const row: BookRow = {
            id,
            internalRowId: `row-${id.slice(0, 8)}`,
            ...input,
        };
        this.store.books.set(id, row);
        return row;
    }

    @ResolveField(() => Author)
    author(@Parent() book: BookRow): AuthorRow {
        const author = this.store.authors.get(book.authorId);
        if (!author) throw new Error(`book ${book.id} references unknown author`);
        return author;
    }

    @ResolveField(() => [Tag])
    tags(@Parent() book: BookRow): TagRow[] {
        return book.tagIds.map((id) => this.store.tags.get(id)!).filter(Boolean);
    }
}
```

Notes:

- The first arg to `ArkQuery` / `ArkMutation` is the **return** schema. The library looks it up in the registry to find the matching `@ObjectType` class. For scalar-returning ops, pass `options.returnType: () => String` etc.
- `@ArkArgs('input', CreateBookInput)` wires the parameter to the input class **and** ensures the validation pipe sees the right metadata.
- `validate: true` runs `schema(returnValue)` after the method completes. Off by default — output validation costs CPU and is usually unnecessary once inputs are validated.

For scalar `@Args('id') id: string` style usage you can keep using vanilla NestJS `@Args` — `ArkArgs` is only required when the parameter type is one of the generated input classes.

---

## 5. The validation pipe

```ts
import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

@Module({
    providers: [
        // Global pipe — applies to every InputType / ArgsType automatically.
        { provide: APP_PIPE, useClass: ArkValidationPipe },
        BookResolver,
        AuthorResolver,
    ],
})
class AppModule {}
```

`ArkValidationPipe` reads the schema attached to the parameter's metatype and runs `schema(value)`. On `ArkErrors`, it throws `BadRequestException({ message: 'Validation failed', errors: out.summary })`.

---

## 6. Module wiring

```ts
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

@Module({
    imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
            driver: ApolloDriver,
            autoSchemaFile: true,
            buildSchemaOptions: {
                // Register types that no resolver references directly so they
                // make it into the schema:
                orphanedTypes: [Author, Book, Tag, CreateAuthorInput, CreateBookInput],
            },
            sortSchema: true,
            playground: false,
        }),
    ],
    providers: [BookResolver, AuthorResolver],
})
class AppModule {}
```

Bootstrap:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

async function main() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ArkValidationPipe()); // or APP_PIPE in providers
    await app.listen(3000);
}

main();
```

The emitted SDL fragment looks like:

```graphql
type Author {
    id: ID!
    name: String!
}

type Book {
    id: ID!
    title: String!
    authorId: ID!
    author: Author!
    tags: [Tag!]!
    # internalRowId is omitted — `{ hidden: true }`
}

type Tag {
    id: ID!
    name: String!
    format: TagFormat!
}

enum TagFormat {
    PHYSICAL
    EBOOK
    AUDIOBOOK
}

input CreateBookInput {
    authorId: ID!
    title: String!
    tagIds: [ID!]!
}
```

---

## 7. Type helpers — `arkPartial`, `arkPick`, `arkOmit`, `arkIntersection`, `arkRequired`

These are direct analogues of NestJS's `PartialType` / `PickType` / `OmitType` / `IntersectionType` / `RequiredType`, driven by ArkType operations on the underlying schema. The kind (input vs object) is inherited from the parent.

```ts
const UpdateBookInput = arkPartial(CreateBookInput, { name: 'UpdateBookInput' });

const BookId = arkPick(Book, ['id'], { name: 'BookId' });

const PublicBook = arkOmit(Book, ['authorId'], { name: 'PublicBook' });

const StrictBook = arkRequired(Book, { name: 'StrictBook' });

const BookWithMeta = arkIntersection(Book, MetaFields, { name: 'BookWithMeta' });
```

Each helper:

1. Reads the schema and kind from the parent class (set by the original factory call).
2. Applies the corresponding ArkType operation (`partial()`, `pick(...)`, `omit(...)`, `merge()`, `required()`).
3. Re-emits a fresh class via `createArkInputType` or `createArkObjectType`.

Pass `kind: 'input' | 'object'` in the options to override the inherited kind (or to disambiguate `arkIntersection` when its parents disagree).

---

## 8. Enums

```ts
const OrderStatusSchema = type("'PENDING' | 'PAID' | 'SHIPPED'");
const OrderStatus = registerArkEnum(OrderStatusSchema, { name: 'OrderStatus' });

// In an InputType / ObjectType:
const OrderInput = createArkInputType(OrderInputSchema, {
    name: 'OrderInput',
    fields: { status: () => OrderStatus.gqlEnumRef },
});
```

`registerArkEnum` returns `{ schema, values, gqlEnumRef, name }`. The `gqlEnumRef` is the plain object NestJS expects as a GraphQL enum reference. `validateArkEnum(schema, value)` is available for one-off runtime checks outside an InputType.

---

## 9. Output validation

Off by default. Toggle per operation:

```ts
@ArkMutation(BookSchema, { name: 'createBook', validate: true })
createBook(@ArkArgs('input', CreateBookInput) input: ...): BookRow { ... }
```

When enabled, the resolver's return value is validated against `BookSchema` before NestJS hands it to the GraphQL serialiser. On failure, an `Error` is thrown with the schema's error summary. Useful in tests / staging; usually skipped in prod for the latency.

---

## 10. End-to-end module shape (copy-paste skeleton)

```ts
import 'reflect-metadata';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Args, GraphQLModule, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { type } from 'arktype';
import {
    ArkArgs,
    ArkMutation,
    ArkQuery,
    ArkValidationPipe,
    arkIdFields,
    arkIdArray,
    createArkInputType,
    createArkObjectType,
    registerArkEnum,
} from './arktype/graphql-arktype';

// 1. Schemas
const TagFormatSchema = type("'PHYSICAL' | 'EBOOK' | 'AUDIOBOOK'");
const TagSchema = type({ id: 'string.uuid.v4', name: 'string > 0', format: TagFormatSchema });
const AuthorSchema = type({ id: 'string.uuid.v4', name: 'string > 0' });
const BookSchema = type({
    id: 'string.uuid.v4',
    title: 'string > 0',
    authorId: 'string.uuid.v4',
    internalRowId: 'string > 0',
});
const CreateBookInputSchema = type({
    authorId: 'string.uuid.v4',
    title: 'string > 0',
    tagIds: type('string.uuid.v4').array(),
});

// 2. GraphQL classes
const TagFormat = registerArkEnum(TagFormatSchema, { name: 'TagFormat' });
const Tag = createArkObjectType(TagSchema, {
    name: 'Tag',
    fields: { format: () => TagFormat.gqlEnumRef },
});
const Author = createArkObjectType(AuthorSchema, { name: 'Author' });
const Book = createArkObjectType(BookSchema, {
    name: 'Book',
    fields: { internalRowId: { hidden: true } },
});
const CreateBookInput = createArkInputType(CreateBookInputSchema, { name: 'CreateBookInput' });

// 3. Resolver
@Resolver(() => Book)
class BookResolver {
    private books = new Map<string, typeof BookSchema.infer>();

    @ArkQuery(BookSchema, { name: 'book', nullable: true })
    getBook(@Args('id') id: string) {
        return this.books.get(id) ?? null;
    }

    @ArkMutation(BookSchema, { name: 'createBook' })
    createBook(@ArkArgs('input', CreateBookInput) input: typeof CreateBookInputSchema.infer) {
        const row = { ...input, id: crypto.randomUUID(), internalRowId: 'row-1' };
        this.books.set(row.id, row);
        return row;
    }
}

// 4. Module
@Module({
    imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
            driver: ApolloDriver,
            autoSchemaFile: true,
            buildSchemaOptions: { orphanedTypes: [Author, Book, Tag, CreateBookInput] },
            sortSchema: true,
        }),
    ],
    providers: [BookResolver],
})
class AppModule {}

// 5. Bootstrap
async function main() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ArkValidationPipe());
    await app.listen(3000);
}

main();
```

A working version of this same shape (multi-resolver + integration test against Apollo) lives at `src/arktype/graphql-arktype/__integration__/library.fixture.ts` and `library.spec.ts`.

---

## Cheat sheet

| Goal | Tool |
| --- | --- |
| Object type for a domain entity | `createArkObjectType(schema, { name })` |
| Input type for a mutation | `createArkInputType(schema, { name })` |
| Loose `@ArgsType()` arg bundle | `createArkArgsType(schema, { name })` |
| Make a property GraphQL `ID` | `fields: { id: arkId }` or `...arkIdFields('id', ...)` |
| Hide a validated field from the schema | `fields: { x: { hidden: true } }` |
| Cross-reference a registered class | `fields: { author: AuthorClass }` (or `[AuthorClass]` for arrays) |
| Force return type for non-object resolvers | `@ArkQuery(schema, { returnType: () => String })` |
| Validate resolver outputs | `@ArkQuery(schema, { validate: true })` |
| Reuse a schema as a partial / picked / omitted variant | `arkPartial` / `arkPick` / `arkOmit` |
| String-literal union → real GraphQL enum | `registerArkEnum(schema, { name })` |
| Globally validate inputs | `app.useGlobalPipes(new ArkValidationPipe())` |
