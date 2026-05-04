import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import type { Type } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Args, ArgsType, GraphQLModule, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { type } from 'arktype';
import 'reflect-metadata';
import {
    ArkArgs,
    ArkMutation,
    ArkQuery,
    ArkSubscription,
    ArkValidationPipe,
    arkOmit,
    arkPick,
    createArkConnectionType,
    createArkCursorPaginatedArgsType,
    createArkInputType,
    createArkInterfaceType,
    createArkObjectType,
    createArkUnion,
    registerArkEnum,
} from '../';

// =============================================================================
// Domain schemas
// =============================================================================

const TagFormatSchema = type("'PHYSICAL' | 'EBOOK' | 'AUDIOBOOK'");

const TagSchema = type({
    format: TagFormatSchema,
    id: 'string.uuid.v4',
    name: 'string > 0 & string <= 64',
});

const IdentifiableSchema = type({
    id: 'string.uuid.v4',
});

const AuthorSchema = type({
    id: 'string.uuid.v4',
    name: 'string > 0 & string <= 256',
});

const BookSchema = type({
    id: 'string.uuid.v4',
    title: 'string > 0 & string <= 512',
    authorId: 'string.uuid.v4',
    // `internalRowId` is intentionally hidden in the GraphQL schema but still
    // Validated by the ArkType pipe — exercises the new `hidden: true` knob.
    internalRowId: 'string > 0',
});

const ValidationErrorSchema = type({
    code: 'string > 0',
    message: 'string > 0',
});

const CreateAuthorInputSchema = type({
    name: 'string > 0 & string <= 256',
});

const CreateBookInputSchema = type({
    authorId: 'string.uuid.v4',
    tagIds: type('string.uuid.v4').array().atLeastLength(0).atMostLength(50),
    title: 'string > 0 & string <= 512',
});

// =============================================================================
// GraphQL types
// =============================================================================

const TagFormat = registerArkEnum(TagFormatSchema, { name: 'LibTagFormat' });

const Tag = createArkObjectType(TagSchema, {
    fields: { format: () => TagFormat.gqlEnumRef },
    name: 'LibTag',
});

// `Identifiable` exercises createArkInterfaceType. The resolveType is shape-driven so any object with an
// `internalRowId` is treated as a Book; otherwise the `name` field disambiguates an Author from a generic node.
const Identifiable = createArkInterfaceType(IdentifiableSchema, {
    name: 'LibIdentifiable',
    resolveType: (value) => {
        if (typeof value !== 'object' || value === null) {
            return undefined;
        }
        if ('internalRowId' in value || 'title' in value) {
            return Book;
        }
        if ('name' in value) {
            return Author;
        }
        return undefined;
    },
});

const Author = createArkObjectType(AuthorSchema, {
    name: 'LibAuthor',
    implements: () => Identifiable,
});

const Book = createArkObjectType(BookSchema, {
    fields: { internalRowId: { hidden: true } },
    implements: () => Identifiable,
    name: 'LibBook',
});

const ValidationError = createArkObjectType(ValidationErrorSchema, {
    name: 'LibValidationError',
});

const CreateAuthorInput = createArkInputType(CreateAuthorInputSchema, {
    name: 'LibCreateAuthorInput',
});

const CreateBookInput = createArkInputType(CreateBookInputSchema, {
    name: 'LibCreateBookInput',
});

// Discriminated union — exercises createArkUnion's default schema-based resolveType.
const CreateBookResult = createArkUnion([Book, ValidationError], {
    description: 'Either the created book or a validation error explaining why creation was rejected.',
    name: 'LibCreateBookResult',
});

// Pick / Omit type helpers projected from the Book object type.
const BookSummary = arkPick(Book, ['id', 'title'], { name: 'LibBookSummary' });
const BookWithoutAuthor = arkOmit(Book, ['authorId'], { name: 'LibBookWithoutAuthor' });

// Cursor-paginated args + Connection — Relay shape baked in, plus a user-supplied `titlePrefix?` filter.
// Re-decorating with `@ArgsType()` is required so NestJS registers the subclass; the parent's @ArgsType()
// metadata is on the parent constructor, not the subclass.
@ArgsType()
class LibBookListArgs extends createArkCursorPaginatedArgsType(type({ 'titlePrefix?': 'string > 0' }), {
    defaultFirst: 5,
    maxPageSize: 50,
    name: 'LibBookListArgs',
}) {}

const { connection: BookConnection } = createArkConnectionType(Book, 'LibBook');

// =============================================================================
// In-memory state
// =============================================================================

interface AuthorRow {
    id: string;
    name: string;
}
interface BookRow {
    id: string;
    title: string;
    authorId: string;
    internalRowId: string;
    tagIds: string[];
}
interface TagRow {
    id: string;
    name: string;
    format: 'PHYSICAL' | 'EBOOK' | 'AUDIOBOOK';
}
interface ValidationErrorRow {
    code: string;
    message: string;
}

class LibraryStore {
    authors = new Map<string, AuthorRow>();
    books = new Map<string, BookRow>();
    tags = new Map<string, TagRow>();
}

// Tiny in-memory pubsub. Real apps would use `graphql-subscriptions` (or a Redis-backed adapter); the integration
// test only needs `asyncIterator()` to exist so NestJS can register the subscription field in the schema.
class TinyPubSub<T> {
    private listeners = new Set<(v: T) => void>();

    publish(value: T): void {
        for (const listener of this.listeners) {
            listener(value);
        }
    }

    asyncIterator(): AsyncIterableIterator<T> {
        const queue: T[] = [];
        const resolvers: ((r: IteratorResult<T>) => void)[] = [];
        const listener = (v: T): void => {
            const next = resolvers.shift();
            if (next) {
                next({ done: false, value: v });
            } else {
                queue.push(v);
            }
        };
        this.listeners.add(listener);
        const iterator: AsyncIterableIterator<T> = {
            [Symbol.asyncIterator]() {
                return this;
            },
            next: (): Promise<IteratorResult<T>> => {
                const next = queue.shift();
                if (next !== undefined) {
                    return Promise.resolve({ done: false, value: next });
                }
                return new Promise((r) => resolvers.push(r));
            },
            return: () => {
                this.listeners.delete(listener);
                return Promise.resolve({ done: true, value: undefined as never });
            },
            throw: (err) => {
                this.listeners.delete(listener);
                return Promise.reject(err);
            },
        };
        return iterator;
    }
}

const SEED_AUTHOR_ID = '11111111-1111-4111-8111-111111111111';
const SEED_TAG_PHYSICAL = '22222222-2222-4222-8222-222222222222';
const SEED_TAG_EBOOK = '33333333-3333-4333-8333-333333333333';

function seed(store: LibraryStore): void {
    store.authors.set(SEED_AUTHOR_ID, { id: SEED_AUTHOR_ID, name: 'Ursula K. Le Guin' });
    store.tags.set(SEED_TAG_PHYSICAL, {
        format: 'PHYSICAL',
        id: SEED_TAG_PHYSICAL,
        name: 'Hardcover',
    });
    store.tags.set(SEED_TAG_EBOOK, { format: 'EBOOK', id: SEED_TAG_EBOOK, name: 'Kindle' });
}

function stableId(seedString: string): string {
    let h = 0;
    for (let i = 0; i < seedString.length; i++) {
        h = (h * 31 + seedString.charCodeAt(i)) >>> 0;
    }
    const hex = (h.toString(16) + '0'.repeat(12)).slice(0, 12);
    return `00000000-0000-4000-8000-${hex}`;
}

function encodeCursor(id: string): string {
    return Buffer.from(id, 'utf8').toString('base64');
}

function decodeCursor(cursor: string): string {
    return Buffer.from(cursor, 'base64').toString('utf8');
}

interface BookEdge {
    cursor: string;
    node: BookRow;
}

interface BookConnectionShape {
    pageInfo: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        startCursor: string | null;
        endCursor: string | null;
    };
    edges: BookEdge[];
}

// =============================================================================
// Resolvers — exercise root + field-level resolution
// =============================================================================

@Resolver(() => Book)
class BookResolver {
    constructor(
        private readonly store: LibraryStore,
        private readonly bookCreatedPubSub: TinyPubSub<BookRow>
    ) {}

    @ArkQuery(BookSchema, { name: 'libBook', nullable: true })
    getBook(@Args('id') id: string): BookRow | null {
        return this.store.books.get(id) ?? null;
    }

    @ArkQuery(BookSchema, { name: 'libBooks', returnType: () => BookConnection })
    listBooks(@Args() args: LibBookListArgs): BookConnectionShape {
        const all = [...this.store.books.values()].toSorted((a, b) => a.id.localeCompare(b.id));
        const filtered = args.titlePrefix
            ? all.filter((b) => b.title.startsWith(args.titlePrefix as string))
            : all;
        const after = args.after ? decodeCursor(args.after) : null;
        const startIndex = after ? filtered.findIndex((b) => b.id === after) + 1 : 0;
        const limit = args.first ?? 5;
        const window = filtered.slice(startIndex, startIndex + limit);
        const edges = window.map((node) => ({ cursor: encodeCursor(node.id), node }));
        return {
            edges,
            pageInfo: {
                endCursor: edges.at(-1)?.cursor ?? null,
                hasNextPage: startIndex + window.length < filtered.length,
                hasPreviousPage: startIndex > 0,
                startCursor: edges[0]?.cursor ?? null,
            },
        };
    }

    @ArkMutation(BookSchema, { name: 'libCreateBook', validate: true })
    createBook(
        // The parameter type reflects what arrives AFTER ArkValidationPipe has
        // Run the schema. Declaring it as the schema's `infer` type makes the
        // Resolver body strongly-typed without a coercion at the boundary —
        // The runtime contract is upheld by the pipe.
        @ArkArgs('input', CreateBookInput) input: typeof CreateBookInputSchema.infer
    ): BookRow {
        if (!this.store.authors.has(input.authorId)) {
            throw new Error(`unknown author ${input.authorId}`);
        }
        const id = stableId(input.title);
        const row: BookRow = {
            authorId: input.authorId,
            id,
            internalRowId: `row-${id.slice(0, 8)}`,
            tagIds: input.tagIds,
            title: input.title,
        };
        this.store.books.set(id, row);
        this.bookCreatedPubSub.publish(row);
        return row;
    }

    @ArkMutation(BookSchema, {
        name: 'libCreateBookSafe',
        returnType: () => CreateBookResult,
    })
    createBookSafe(
        @ArkArgs('input', CreateBookInput) input: typeof CreateBookInputSchema.infer
    ): BookRow | ValidationErrorRow {
        if (!this.store.authors.has(input.authorId)) {
            return { code: 'UNKNOWN_AUTHOR', message: `author ${input.authorId} does not exist` };
        }
        const id = stableId(input.title);
        const row: BookRow = {
            authorId: input.authorId,
            id,
            internalRowId: `row-${id.slice(0, 8)}`,
            tagIds: input.tagIds,
            title: input.title,
        };
        this.store.books.set(id, row);
        this.bookCreatedPubSub.publish(row);
        return row;
    }

    @ArkSubscription(BookSchema, { name: 'libBookCreated' })
    bookCreated(): AsyncIterableIterator<BookRow> {
        return this.bookCreatedPubSub.asyncIterator();
    }

    @ResolveField(() => Author)
    author(@Parent() book: BookRow): AuthorRow {
        const author = this.store.authors.get(book.authorId);
        if (!author) {
            throw new Error(`book ${book.id} references unknown author`);
        }
        return author;
    }

    @ResolveField(() => [Tag])
    tags(@Parent() book: BookRow): TagRow[] {
        return book.tagIds.map((id) => this.store.tags.get(id)).filter((row): row is TagRow => row !== undefined);
    }
}

@Resolver(() => Author)
class AuthorResolver {
    constructor(private readonly store: LibraryStore) {}

    @ArkQuery(AuthorSchema, { name: 'libAuthor', nullable: true })
    getAuthor(@Args('id') id: string): AuthorRow | null {
        return this.store.authors.get(id) ?? null;
    }

    @ArkMutation(AuthorSchema, { name: 'libCreateAuthor' })
    createAuthor(@ArkArgs('input', CreateAuthorInput) input: typeof CreateAuthorInputSchema.infer): AuthorRow {
        const id = stableId(input.name);
        const row: AuthorRow = { id, name: input.name };
        this.store.authors.set(id, row);
        return row;
    }

    // Reverse relation — proves field resolvers work on output types
    // Beyond root queries.
    @ResolveField(() => [Book])
    books(@Parent() author: AuthorRow): BookRow[] {
        return [...this.store.books.values()].filter((b) => b.authorId === author.id);
    }
}

// =============================================================================
// AppModule factory — fresh module + state per test run
// =============================================================================

const PUBSUB_TOKEN = Symbol('LibBookCreatedPubSub');

export function buildLibraryApp(): {
    module: Type<unknown>;
    store: LibraryStore;
    pubsub: TinyPubSub<BookRow>;
} {
    const store = new LibraryStore();
    const pubsub = new TinyPubSub<BookRow>();
    seed(store);

    @Module({
        imports: [
            GraphQLModule.forRoot<ApolloDriverConfig>({
                autoSchemaFile: true,
                buildSchemaOptions: {
                    orphanedTypes: [
                        Author,
                        Book,
                        Tag,
                        ValidationError,
                        Identifiable,
                        BookSummary,
                        BookWithoutAuthor,
                        BookConnection,
                        CreateAuthorInput,
                        CreateBookInput,
                    ],
                },
                driver: ApolloDriver,
                introspection: true,
                playground: false,
                plugins: [ApolloServerPluginLandingPageDisabled()],
                sortSchema: true,
            }),
        ],
        providers: [
            { provide: LibraryStore, useValue: store },
            { provide: TinyPubSub, useValue: pubsub },
            BookResolver,
            AuthorResolver,
        ],
    })
    class LibraryAppModule {}

    return { module: LibraryAppModule, pubsub, store };
}

export {
    ArkValidationPipe,
    Author,
    AuthorSchema,
    Book,
    BookConnection,
    LibBookListArgs,
    BookSchema,
    BookSummary,
    BookWithoutAuthor,
    CreateAuthorInput,
    CreateBookInput,
    CreateBookResult,
    Identifiable,
    LibraryStore,
    PUBSUB_TOKEN,
    SEED_AUTHOR_ID,
    SEED_TAG_EBOOK,
    SEED_TAG_PHYSICAL,
    Tag,
    TinyPubSub,
    ValidationError,
};
