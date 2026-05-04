import { ArkErrors, type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { arrayDistinctBy } from './array-distinct-by';

describe('arrayDistinctBy', () => {
    const Item = type({ key: 'string', value: 'string' });
    const DistinctItems = arrayDistinctBy(Item, 'key');

    it('accepts arrays with distinct keys', () => {
        const input = [
            { key: '1', value: 'one' },
            { key: '2', value: 'two' },
        ];
        expect(DistinctItems(input)).toEqual(input);
    });

    it('accepts arrays where only the value (not the key) repeats', () => {
        const input = [
            { key: '1', value: 'same' },
            { key: '2', value: 'same' },
        ];
        expect(DistinctItems(input)).toEqual(input);
    });

    it('rejects arrays with duplicate keys', () => {
        const input = [
            { key: '1', value: 'one' },
            { key: '1', value: 'two' },
        ];
        expect(DistinctItems(input)).toBeInstanceOf(ArkErrors);
    });

    it('accepts an empty array', () => {
        expect(DistinctItems([])).toEqual([]);
    });

    it('rejects elements that fail the item schema', () => {
        // Declare as `unknown` directly so arktype gets the loose input shape
        // It validates against — no coercion required.
        const input: unknown = [{ key: '1' }];
        expect(DistinctItems(input)).toBeInstanceOf(ArkErrors);
    });
});
