import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import request from 'supertest';
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import {
    ArkValidationPipe,
    SEED_AUTHOR_ID,
    SEED_TAG_EBOOK,
    SEED_TAG_PHYSICAL,
    buildLibraryApp,
} from './library.fixture';

interface GqlError {
    message: string;
    extensions?: Record<string, unknown>;
}

interface GqlResponse<T> {
    data: T | null;
    errors?: GqlError[];
}

/**
 * Runtime guard for the JSON body returned by Apollo over `/graphql`. Confirms the value matches the GraphQL
 * spec's response envelope before we hand it back as a typed `GqlResponse<T>` — `'data' in value` narrows the
 * unknown input directly via TypeScript's `in`-operator narrowing, so no coercion is required.
 */
function isGqlResponse<T>(value: unknown): value is GqlResponse<T> {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    if ('data' in value) {
        const { data } = value;
        if (data !== null && (typeof data !== 'object' || Array.isArray(data))) {
            return false;
        }
    }
    if ('errors' in value && !Array.isArray(value.errors)) {
        return false;
    }
    return 'data' in value || 'errors' in value;
}

describe('graphql-arktype — in-memory NestJS GraphQL integration', () => {
    let app: INestApplication;
    let httpServer: ReturnType<INestApplication['getHttpServer']>;

    beforeAll(async () => {
        const { module } = buildLibraryApp();
        const moduleRef = await Test.createTestingModule({ imports: [module] }).compile();
        app = moduleRef.createNestApplication({ logger: false });
        app.useGlobalPipes(new ArkValidationPipe());
        await app.init();
        httpServer = app.getHttpServer();
    });

    afterAll(async () => {
        await app.close();
    });

    async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<GqlResponse<T>> {
        const res = await request(httpServer)
            .post('/graphql')
            .set('content-type', 'application/json')
            .send({ query, variables });
        const { body } = res;
        assert(isGqlResponse<T>(body), `unexpected response shape from /graphql: ${JSON.stringify(body)}`);
        return body;
    }

    // -------------------------------------------------------------------------
    // Hidden field
    // -------------------------------------------------------------------------

    it('hides `internalRowId` from introspection', async () => {
        const res = await gql<{ __type: { fields: { name: string }[] } }>(
            `{ __type(name: "LibBook") { fields { name } } }`
        );
        expect(res.errors).toBeUndefined();
        assert(res.data, 'introspection returned no data');
        const fieldNames = res.data.__type.fields.map((f) => f.name);
        expect(fieldNames).toEqual(expect.arrayContaining(['id', 'title', 'authorId']));
        expect(fieldNames).not.toContain('internalRowId');
    });

    it('rejects a query that selects the hidden field', async () => {
        const res = await gql(`{ libBook(id: "00000000-0000-4000-8000-doesnotexist") { id internalRowId } }`);
        assert(res.errors, 'expected GraphQL errors when selecting a hidden field');
        expect(res.errors[0].message).toMatch(/internalRowId/);
    });

    // -------------------------------------------------------------------------
    // Mutations + nested object validation
    // -------------------------------------------------------------------------

    it('creates a book referencing the seeded author and validates the input via ArkValidationPipe', async () => {
        const res = await gql<{
            libCreateBook: { id: string; title: string; authorId: string };
        }>(
            `mutation Create($input: LibCreateBookInput!) {
        libCreateBook(input: $input) { id title authorId }
      }`,
            {
                input: {
                    authorId: SEED_AUTHOR_ID,
                    tagIds: [SEED_TAG_PHYSICAL, SEED_TAG_EBOOK],
                    title: 'A Wizard of Earthsea',
                },
            }
        );

        expect(res.errors).toBeUndefined();
        assert(res.data, 'no data returned from libCreateBook');
        expect(res.data.libCreateBook.title).toBe('A Wizard of Earthsea');
        expect(res.data.libCreateBook.authorId).toBe(SEED_AUTHOR_ID);
        expect(res.data.libCreateBook.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects a malformed input via ArkValidationPipe (empty title)', async () => {
        const res = await gql(
            `mutation Create($input: LibCreateBookInput!) {
        libCreateBook(input: $input) { id }
      }`,
            {
                input: {
                    authorId: SEED_AUTHOR_ID,
                    tagIds: [],
                    title: '',
                },
            }
        );
        assert(res.errors, 'expected validation errors');
        expect(res.errors[0].message).toMatch(/Validation failed/);
    });

    it('rejects an authorId that is not a UUID via ArkValidationPipe', async () => {
        const res = await gql(
            `mutation Create($input: LibCreateBookInput!) {
        libCreateBook(input: $input) { id }
      }`,
            {
                input: { authorId: 'not-a-uuid', tagIds: [], title: 'Bad' },
            }
        );
        assert(res.errors, 'expected validation errors');
        expect(res.errors[0].message).toMatch(/Validation failed/);
    });

    // -------------------------------------------------------------------------
    // Field resolvers — relations beyond the root
    // -------------------------------------------------------------------------

    it('resolves the book.author relation via @ResolveField', async () => {
        // A book was created in an earlier test — fetch it back via author.books.
        const lookup = await gql<{
            libAuthor: { id: string; name: string; books: { id: string; title: string }[] };
        }>(
            `query Get($id: String!) {
        libAuthor(id: $id) {
          id
          name
          books { id title }
        }
      }`,
            { id: SEED_AUTHOR_ID }
        );
        expect(lookup.errors).toBeUndefined();
        assert(lookup.data, 'no data');
        expect(lookup.data.libAuthor.id).toBe(SEED_AUTHOR_ID);
        expect(lookup.data.libAuthor.books.length).toBeGreaterThan(0);

        // Now traverse from the book back to its author — full round-trip via field
        // Resolvers.
        const someBookId = lookup.data.libAuthor.books[0].id;
        const round = await gql<{
            libBook: { id: string; author: { id: string; name: string } };
        }>(
            `query Get($id: String!) {
        libBook(id: $id) { id author { id name } }
      }`,
            { id: someBookId }
        );
        expect(round.errors).toBeUndefined();
        assert(round.data, 'no data');
        assert(round.data.libBook, 'expected libBook in response');
        expect(round.data.libBook.author.id).toBe(SEED_AUTHOR_ID);
        expect(round.data.libBook.author.name).toBe('Ursula K. Le Guin');
    });

    it('resolves the book.tags relation including the enum field', async () => {
        const create = await gql<{ libCreateBook: { id: string } }>(
            `mutation Create($input: LibCreateBookInput!) {
        libCreateBook(input: $input) { id }
      }`,
            {
                input: {
                    authorId: SEED_AUTHOR_ID,
                    tagIds: [SEED_TAG_PHYSICAL, SEED_TAG_EBOOK],
                    title: 'The Dispossessed',
                },
            }
        );
        assert(create.data, 'create failed');
        const bookId = create.data.libCreateBook.id;

        const res = await gql<{
            libBook: { id: string; tags: { name: string; format: string }[] };
        }>(
            `query Get($id: String!) {
        libBook(id: $id) {
          id
          tags { name format }
        }
      }`,
            { id: bookId }
        );
        expect(res.errors).toBeUndefined();
        assert(res.data, 'no data');
        assert(res.data.libBook, 'libBook missing');
        const formats = res.data.libBook.tags.map((t) => t.format).toSorted();
        expect(formats).toEqual(['EBOOK', 'PHYSICAL']);
    });

    it('exposes the GraphQL enum via introspection with the registered name', async () => {
        const res = await gql<{
            __type: { kind: string; enumValues: { name: string }[] } | null;
        }>(`{ __type(name: "LibTagFormat") { kind enumValues { name } } }`);
        expect(res.errors).toBeUndefined();
        assert(res.data?.__type, 'enum type not found');
        expect(res.data.__type.kind).toBe('ENUM');
        expect(new Set(res.data.__type.enumValues.map((v) => v.name))).toEqual(
            new Set(['PHYSICAL', 'EBOOK', 'AUDIOBOOK'])
        );
    });

    // -------------------------------------------------------------------------
    // Interface — createArkInterfaceType
    // -------------------------------------------------------------------------

    it('registers LibIdentifiable as an INTERFACE in the schema and Book/Author implement it', async () => {
        const iface = await gql<{
            __type: { kind: string; fields: { name: string }[]; possibleTypes: { name: string }[] } | null;
        }>(
            `{ __type(name: "LibIdentifiable") { kind fields { name } possibleTypes { name } } }`
        );
        expect(iface.errors).toBeUndefined();
        assert(iface.data?.__type, 'interface type not found');
        expect(iface.data.__type.kind).toBe('INTERFACE');
        expect(iface.data.__type.fields.map((f) => f.name)).toEqual(['id']);
        const possible = new Set(iface.data.__type.possibleTypes.map((t) => t.name));
        expect(possible).toEqual(new Set(['LibAuthor', 'LibBook']));
    });

    // -------------------------------------------------------------------------
    // Union — createArkUnion + default schema-based resolveType
    // -------------------------------------------------------------------------

    it('registers LibCreateBookResult as a UNION in the schema', async () => {
        const res = await gql<{ __type: { kind: string; possibleTypes: { name: string }[] } | null }>(
            `{ __type(name: "LibCreateBookResult") { kind possibleTypes { name } } }`
        );
        expect(res.errors).toBeUndefined();
        assert(res.data?.__type, 'union type not found');
        expect(res.data.__type.kind).toBe('UNION');
        expect(new Set(res.data.__type.possibleTypes.map((t) => t.name))).toEqual(
            new Set(['LibBook', 'LibValidationError'])
        );
    });

    it('returns a Book branch from the union mutation when the input is valid', async () => {
        const res = await gql<{
            libCreateBookSafe:
                | { __typename: 'LibBook'; id: string; title: string }
                | { __typename: 'LibValidationError'; code: string; message: string };
        }>(
            `mutation Create($input: LibCreateBookInput!) {
                libCreateBookSafe(input: $input) {
                    __typename
                    ... on LibBook { id title }
                    ... on LibValidationError { code message }
                }
            }`,
            {
                input: {
                    authorId: SEED_AUTHOR_ID,
                    tagIds: [SEED_TAG_PHYSICAL],
                    title: 'Tehanu',
                },
            }
        );
        expect(res.errors).toBeUndefined();
        assert(res.data, 'no data');
        assert(res.data.libCreateBookSafe.__typename === 'LibBook', 'expected Book branch');
        expect(res.data.libCreateBookSafe.title).toBe('Tehanu');
    });

    it('returns a ValidationError branch from the union mutation when the author is unknown', async () => {
        const res = await gql<{
            libCreateBookSafe:
                | { __typename: 'LibBook'; id: string }
                | { __typename: 'LibValidationError'; code: string; message: string };
        }>(
            `mutation Create($input: LibCreateBookInput!) {
                libCreateBookSafe(input: $input) {
                    __typename
                    ... on LibBook { id }
                    ... on LibValidationError { code message }
                }
            }`,
            {
                input: {
                    authorId: '99999999-9999-4999-8999-999999999999',
                    tagIds: [],
                    title: 'Phantom',
                },
            }
        );
        expect(res.errors).toBeUndefined();
        assert(res.data, 'no data');
        assert(
            res.data.libCreateBookSafe.__typename === 'LibValidationError',
            'expected ValidationError branch'
        );
        expect(res.data.libCreateBookSafe.code).toBe('UNKNOWN_AUTHOR');
    });

    // -------------------------------------------------------------------------
    // Cursor pagination — Connection + paginated args + default values
    // -------------------------------------------------------------------------

    it('encodes the cursor-args defaultFirst as a Field defaultValue in the schema', async () => {
        // @ArgsType classes are inlined onto the operation field as arguments rather than surfaced as
        // top-level types — query the Query.libBooks args slot to read the defaultValue.
        const res = await gql<{
            __type: {
                fields: { name: string; args: { name: string; defaultValue: string | null }[] }[];
            } | null;
        }>(`{ __type(name: "Query") { fields { name args { name defaultValue } } } }`);
        expect(res.errors).toBeUndefined();
        assert(res.data?.__type, 'Query type not found');
        const libBooks = res.data.__type.fields.find((f) => f.name === 'libBooks');
        assert(libBooks, 'libBooks field missing');
        const first = libBooks.args.find((a) => a.name === 'first');
        assert(first, 'first arg missing');
        expect(first.defaultValue).toBe('5');
    });

    it('returns a paginated LibBookConnection from libBooks', async () => {
        // Seed a few extra books so the page actually paginates.
        for (const title of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta']) {
            await gql(
                `mutation Create($input: LibCreateBookInput!) {
                    libCreateBook(input: $input) { id }
                }`,
                {
                    input: {
                        authorId: SEED_AUTHOR_ID,
                        tagIds: [SEED_TAG_PHYSICAL],
                        title,
                    },
                }
            );
        }
        const page1 = await gql<{
            libBooks: {
                edges: { cursor: string; node: { id: string; title: string } }[];
                pageInfo: {
                    endCursor: string | null;
                    hasNextPage: boolean;
                    hasPreviousPage: boolean;
                    startCursor: string | null;
                };
            };
        }>(
            `{ libBooks(first: 3) {
                edges { cursor node { id title } }
                pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
            } }`
        );
        expect(page1.errors).toBeUndefined();
        assert(page1.data, 'no data');
        expect(page1.data.libBooks.edges.length).toBe(3);
        expect(page1.data.libBooks.pageInfo.hasNextPage).toBe(true);
        expect(page1.data.libBooks.pageInfo.hasPreviousPage).toBe(false);

        const lastCursor = page1.data.libBooks.pageInfo.endCursor;
        assert(lastCursor, 'expected an endCursor');
        const page2 = await gql<{
            libBooks: { edges: { cursor: string; node: { id: string } }[]; pageInfo: { hasPreviousPage: boolean } };
        }>(
            `query Next($after: String!) { libBooks(first: 3, after: $after) {
                edges { cursor node { id } }
                pageInfo { hasPreviousPage }
            } }`,
            { after: lastCursor }
        );
        expect(page2.errors).toBeUndefined();
        assert(page2.data, 'no data');
        expect(page2.data.libBooks.pageInfo.hasPreviousPage).toBe(true);
        // The two pages should not share any nodes.
        const idsP1 = new Set(page1.data.libBooks.edges.map((e) => e.node.id));
        for (const edge of page2.data.libBooks.edges) {
            expect(idsP1.has(edge.node.id)).toBe(false);
        }
    });

    it('rejects a pagination request that exceeds maxPageSize', async () => {
        const res = await gql(`{ libBooks(first: 999) { edges { cursor } } }`);
        // Apollo wraps schema-validation failures from the pipe as GraphQL errors.
        assert(res.errors, 'expected validation errors');
        expect(res.errors[0].message).toMatch(/Variable|Validation|first|integer|less|maximum/i);
    });

    // -------------------------------------------------------------------------
    // Type helpers — arkPick / arkOmit
    // -------------------------------------------------------------------------

    it('exposes arkPick output (LibBookSummary) with only id + title fields', async () => {
        const res = await gql<{ __type: { fields: { name: string }[] } | null }>(
            `{ __type(name: "LibBookSummary") { fields { name } } }`
        );
        expect(res.errors).toBeUndefined();
        assert(res.data?.__type, 'pick type not found');
        expect(new Set(res.data.__type.fields.map((f) => f.name))).toEqual(new Set(['id', 'title']));
    });

    it('exposes arkOmit output (LibBookWithoutAuthor) without authorId', async () => {
        const res = await gql<{ __type: { fields: { name: string }[] } | null }>(
            `{ __type(name: "LibBookWithoutAuthor") { fields { name } } }`
        );
        expect(res.errors).toBeUndefined();
        assert(res.data?.__type, 'omit type not found');
        const fieldNames = res.data.__type.fields.map((f) => f.name);
        expect(fieldNames).not.toContain('authorId');
        expect(fieldNames).toContain('id');
        expect(fieldNames).toContain('title');
    });

    // -------------------------------------------------------------------------
    // Subscription — ArkSubscription registers the field in the schema
    // -------------------------------------------------------------------------

    it('registers libBookCreated as a subscription field returning LibBook', async () => {
        const res = await gql<{
            __schema: { subscriptionType: { fields: { name: string; type: { name: string | null } }[] } | null };
        }>(`{ __schema { subscriptionType { fields { name type { ofType { name } name } } } } }`);
        expect(res.errors).toBeUndefined();
        // The selection above mismatches the introspection shape on the parent layer; reissue with a tighter shape.
        const refined = await gql<{
            __type: { fields: { name: string }[] } | null;
        }>(`{ __type(name: "Subscription") { fields { name } } }`);
        expect(refined.errors).toBeUndefined();
        assert(refined.data?.__type, 'no Subscription type');
        expect(refined.data.__type.fields.map((f) => f.name)).toContain('libBookCreated');
    });
});
