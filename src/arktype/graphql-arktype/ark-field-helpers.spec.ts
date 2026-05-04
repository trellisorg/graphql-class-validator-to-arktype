import { ID } from '@nestjs/graphql';
import { describe, expect, it } from 'vitest';
import { arkId, arkIdArray, arkIdFields } from './ark-field-helpers';

describe('arkId / arkIdArray', () => {
    it('arkId resolves to the GraphQL ID scalar', () => {
        expect(arkId()).toBe(ID);
    });

    it('arkIdArray resolves to a single-element [ID] tuple', () => {
        expect(arkIdArray()).toEqual([ID]);
    });
});

describe('arkIdFields', () => {
    it('produces an entry mapped to arkId for every supplied name', () => {
        const fields = arkIdFields('id', 'authorId', 'tagId');
        expect(Object.keys(fields)).toEqual(['id', 'authorId', 'tagId']);
        expect(fields.id).toBe(arkId);
        expect(fields.authorId).toBe(arkId);
        expect(fields.tagId).toBe(arkId);
    });

    it('returns an empty object when called with no names', () => {
        expect(arkIdFields()).toEqual({});
    });
});
