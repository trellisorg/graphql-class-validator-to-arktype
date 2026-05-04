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
});
