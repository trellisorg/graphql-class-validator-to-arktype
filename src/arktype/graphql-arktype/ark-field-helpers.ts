import { type ReturnTypeFunc, ID } from '@nestjs/graphql';

export const arkId: ReturnTypeFunc = () => ID;

export const arkIdArray: ReturnTypeFunc = () => [ID];

/**
 * Build a `fields` overrides fragment that maps every supplied property name to GraphQL `ID`. Spread it into
 * `createArkInputType` / `createArkObjectType` / `createArkArgsType` so prefixed-id (or otherwise non-uuid) string
 * properties surface as `ID` in the GraphQL schema:
 *
 * ```ts
 * createArkObjectType(BookSchema, {
 *     name: 'Book',
 *     fields: { ...arkIdFields('id', 'authorId'), tagIds: arkIdArray },
 * });
 * ```
 */
export function arkIdFields<K extends string>(...names: readonly K[]): { [P in K]: ReturnTypeFunc } {
    const out = {} as { [P in K]: ReturnTypeFunc };
    for (const name of names) {
        out[name] = arkId;
    }
    return out;
}
