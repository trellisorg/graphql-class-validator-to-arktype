import { ArkErrors, type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { loadAttachedSchema } from './__test-utils__/load-schema';
import { createArkInputType } from './ark-input-type';
import { createArkObjectType } from './ark-object-type';
import { arkIntersection, arkOmit, arkPartial, arkPick, arkRequired } from './ark-type-helpers';
import { getArkKind } from './core';

describe('arkPartial', () => {
    const BookSchema = type({
        pages: 'number.integer > 0',
        title: 'string > 0',
    });
    const Book = createArkInputType(BookSchema, { name: 'BookInputUnique1' });

    it('produces a class whose schema treats every key as optional', () => {
        const PartialBook = arkPartial(Book, { name: 'PartialBookInputUnique1' });
        const schema = loadAttachedSchema(PartialBook);
        expect(schema({})).toEqual({});
        expect(schema({ title: 'War and Peace' })).toEqual({ title: 'War and Peace' });
    });

    it('preserves the kind of the parent', () => {
        const PartialBook = arkPartial(Book, { name: 'PartialBookInputUnique2' });
        expect(getArkKind(PartialBook)).toBe('input');
    });
});

describe('arkPick', () => {
    const PersonSchema = type({
        age: 'number.integer >= 0',
        id: 'string.uuid.v4',
        name: 'string > 0',
    });
    const Person = createArkInputType(PersonSchema, { name: 'PersonInputUnique1' });

    it('keeps only the chosen keys as required', () => {
        const NameOnly = arkPick(Person, ['name'] as const, { name: 'NameOnlyInputUnique1' });
        const schema = loadAttachedSchema(NameOnly);
        expect(schema({ name: 'Alice' })).toEqual({ name: 'Alice' });
        // Dropped keys are no longer required.
        expect(schema({})).toBeInstanceOf(ArkErrors);
    });
});

describe('arkOmit', () => {
    const PersonSchema = type({
        age: 'number.integer >= 0',
        id: 'string.uuid.v4',
        name: 'string > 0',
    });
    const Person = createArkInputType(PersonSchema, { name: 'PersonInputUnique2' });

    it('removes the omitted key from the required set, leaves the rest', () => {
        const NoId = arkOmit(Person, ['id'] as const, { name: 'NoIdInputUnique1' });
        const schema = loadAttachedSchema(NoId);
        // Id is no longer required; payload is accepted without it.
        expect(schema({ age: 30, name: 'Alice' })).toEqual({ age: 30, name: 'Alice' });
        // Other keys are still required.
        expect(schema({ name: 'Alice' })).toBeInstanceOf(ArkErrors);
    });
});

describe('arkRequired', () => {
    const SettingsSchema = type({
        'lang?': 'string',
        'theme?': 'string',
    });
    const Settings = createArkInputType(SettingsSchema, { name: 'SettingsInputUnique1' });

    it('flips optional keys to required', () => {
        const Required = arkRequired(Settings, { name: 'RequiredSettingsInputUnique1' });
        const schema = loadAttachedSchema(Required);
        expect(schema({ lang: 'en', theme: 'dark' })).toEqual({ lang: 'en', theme: 'dark' });
        expect(schema({ theme: 'dark' })).toBeInstanceOf(ArkErrors);
    });
});

describe('arkIntersection', () => {
    const NameSchema = type({ name: 'string > 0' });
    const AgeSchema = type({ age: 'number.integer >= 0' });
    const NameInput = createArkInputType(NameSchema, { name: 'NameInputUnique1' });
    const AgeInput = createArkInputType(AgeSchema, { name: 'AgeInputUnique1' });

    it('merges two schemas of the same kind', () => {
        const Combined = arkIntersection(NameInput, AgeInput, { name: 'NameAndAgeInputUnique1' });
        const schema = loadAttachedSchema(Combined);
        expect(schema({ age: 30, name: 'Alice' })).toEqual({ age: 30, name: 'Alice' });
        expect(schema({ name: 'Alice' })).toBeInstanceOf(ArkErrors);
    });

    it('throws when parents have different kinds without an explicit override', () => {
        const NameObject = createArkObjectType(NameSchema, { name: 'NameObjectUnique1' });
        expect(() => arkIntersection(NameInput, NameObject, { name: 'MixedKindUnique1' })).toThrowError(
            /different kinds/
        );
    });
});

describe('readParent guard', () => {
    it('throws when the parent class has no attached schema', () => {
        class NotAnArkClass {}
        expect(() => arkPartial(NotAnArkClass, { name: 'NopeUnique1' })).toThrowError(/no schema metadata/);
    });
});
