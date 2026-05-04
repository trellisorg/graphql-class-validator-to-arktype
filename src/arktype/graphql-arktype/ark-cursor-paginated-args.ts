import { type } from 'arktype';
import type { Type as ArkType } from 'arktype';
import { type CreateArkArgsTypeOptions, createArkArgsType } from './ark-args-type';

export interface CreateArkCursorPaginatedArgsTypeOptions extends CreateArkArgsTypeOptions {
    /**
     * Default value applied to `first` when the client omits it.
     */
    defaultFirst?: number;
    /**
     * Hard upper bound on `first` and `last` so a client can't ask for an unbounded page.
     */
    maxPageSize?: number;
}

const DEFAULT_FIRST = 10;
const DEFAULT_MAX_PAGE_SIZE = 200;

/**
 * Build a cursor-paginated `@ArgsType()` class. Standard Relay arguments (`first`, `last`, `before`, `after`) are
 * baked in; pass `extraSchema` to merge additional arktype properties (filters, sort orders, etc.) into the same
 * args bundle.
 *
 * Defaults: `first = 10` when omitted, hard ceiling of 200. Both are tunable per-call.
 *
 * @example
 *     const BookListArgs = createArkCursorPaginatedArgsType(
 *         type({ 'genre?': "'fiction' | 'nonfiction'" }),
 *         { name: 'BookListArgs', defaultFirst: 25, maxPageSize: 100 }
 *     );
 */
export function createArkCursorPaginatedArgsType<TExtra extends ArkType<any> | undefined = undefined>(
    extraSchema?: TExtra,
    options: CreateArkCursorPaginatedArgsTypeOptions = {}
): new () => CursorPaginatedArgsShape<TExtra> {
    const defaultFirst = options.defaultFirst ?? DEFAULT_FIRST;
    const maxPageSize = options.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;

    const base = type({
        first: type('number.integer >= 1')
            .atMost(maxPageSize)
            .default(defaultFirst as never),
        'last?': type('number.integer >= 1').atMost(maxPageSize),
        'after?': 'string',
        'before?': 'string',
    });

    // `.and(extra)` merges keys; conflicts on `first/last/before/after` would be a user error and arktype will
    // surface them as a parse-time error. Skipping the merge when no extras were supplied avoids producing an
    // intersection-of-empty-object type that `toJsonSchema()` would still render as a separate node.
    const merged = extraSchema ? (base.and(extraSchema as ArkType<any>) as ArkType<any>) : (base as ArkType<any>);

    return createArkArgsType(merged, options) as new () => CursorPaginatedArgsShape<TExtra>;
}

/**
 * Standard cursor-args slice — surfaced separately so resolvers can type their parameter without re-deriving the
 * shape from the factory return type.
 */
export interface CursorPaginatedArgsBase {
    first?: number;
    last?: number;
    after?: string;
    before?: string;
}

type CursorPaginatedArgsShape<TExtra extends ArkType<any> | undefined> = CursorPaginatedArgsBase &
    (TExtra extends ArkType<any> ? TExtra['infer'] : Record<string, never>);
