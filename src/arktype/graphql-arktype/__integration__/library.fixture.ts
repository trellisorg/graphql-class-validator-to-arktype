import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import type { Type } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Args, GraphQLModule, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { type } from 'arktype';
import 'reflect-metadata';
import {
    ArkArgs,
    ArkMutation,
    ArkQuery,
    ArkValidationPipe,
    createArkInputType,
    createArkObjectType,
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

const Author = createArkObjectType(AuthorSchema, { name: 'LibAuthor' });

const Book = createArkObjectType(BookSchema, {
    fields: { internalRowId: { hidden: true } },
    name: 'LibBook',
});

const CreateAuthorInput = createArkInputType(CreateAuthorInputSchema, {
    name: 'LibCreateAuthorInput',
});

const CreateBookInput = createArkInputType(CreateBookInputSchema, {
    name: 'LibCreateBookInput',
});

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

class LibraryStore {
    authors = new Map<string, AuthorRow>();
    books = new Map<string, BookRow>();
    tags = new Map<string, TagRow>();
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

// =============================================================================
// Resolvers — exercise root + field-level resolution
// =============================================================================

@Resolver(() => Book)
class BookResolver {
    constructor(private readonly store: LibraryStore) {}

    @ArkQuery(BookSchema, { name: 'libBook', nullable: true })
    getBook(@Args('id') id: string): BookRow | null {
        return this.store.books.get(id) ?? null;
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
        return row;
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

export function buildLibraryApp(): {
    module: Type<unknown>;
    store: LibraryStore;
} {
    const store = new LibraryStore();
    seed(store);

    @Module({
        imports: [
            GraphQLModule.forRoot<ApolloDriverConfig>({
                autoSchemaFile: true,
                buildSchemaOptions: {
                    orphanedTypes: [Author, Book, Tag, CreateAuthorInput, CreateBookInput],
                },
                driver: ApolloDriver,
                introspection: true,
                playground: false,
                plugins: [ApolloServerPluginLandingPageDisabled()],
                sortSchema: true,
            }),
        ],
        providers: [{ provide: LibraryStore, useValue: store }, BookResolver, AuthorResolver],
    })
    class LibraryAppModule {}

    return { module: LibraryAppModule, store };
}

export {
    ArkValidationPipe,
    Author,
    AuthorSchema,
    Book,
    BookSchema,
    CreateAuthorInput,
    CreateBookInput,
    LibraryStore,
    SEED_AUTHOR_ID,
    SEED_TAG_EBOOK,
    SEED_TAG_PHYSICAL,
    Tag,
};
