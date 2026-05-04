import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Relay-style cursor pagination shape. Built imperatively (not via an arktype schema) because Connection / Edge /
 * PageInfo are library-defined output types — they have no user-facing validation needs and shouldn't drag the
 * arktype JSON-schema pipeline through trivial structural shapes.
 */

let cachedPageInfo: Function | null = null;

/**
 * Lazily build the singleton `PageInfo` `@ObjectType` the first time a Connection asks for it. Subsequent
 * `createArkConnectionType` calls reuse the same class so `@nestjs/graphql` only sees one `PageInfo` declaration.
 */
function ensurePageInfo(): Function {
    if (cachedPageInfo) {
        return cachedPageInfo;
    }
    class PageInfo {
        hasNextPage!: boolean;
        hasPreviousPage!: boolean;
        startCursor!: string | null;
        endCursor!: string | null;
    }
    Object.defineProperty(PageInfo, 'name', { value: 'PageInfo' });

    Field(() => Boolean, { description: 'True when more results follow `endCursor`.' })(
        PageInfo.prototype,
        'hasNextPage'
    );
    Field(() => Boolean, { description: 'True when results precede `startCursor`.' })(
        PageInfo.prototype,
        'hasPreviousPage'
    );
    Field(() => String, { nullable: true, description: 'Cursor for the first edge in the page; null on empty.' })(
        PageInfo.prototype,
        'startCursor'
    );
    Field(() => String, { nullable: true, description: 'Cursor for the last edge in the page; null on empty.' })(
        PageInfo.prototype,
        'endCursor'
    );

    ObjectType('PageInfo', { description: 'Standard Relay PageInfo carrying cursor + hasNext/Prev hints.' })(
        PageInfo
    );

    cachedPageInfo = PageInfo;
    return PageInfo;
}

export interface CreateArkConnectionTypeOptions {
    description?: string;
}

export interface ArkConnectionType<TNode extends new () => unknown> {
    /** The `<Name>Connection` class — use as a resolver return type. */
    connection: new () => { pageInfo: unknown; edges: { cursor: string; node: InstanceType<TNode> }[] };
    /** The `<Name>Edge` class — exposed for advanced consumers; usually not referenced directly. */
    edge: new () => { cursor: string; node: InstanceType<TNode> };
    /** The shared `PageInfo` class — same singleton across every connection. */
    pageInfo: Function;
}

/**
 * Build the Relay `<Name>Edge` and `<Name>Connection` `@ObjectType` classes for a given node class. The node class
 * must already be a registered GraphQL type (e.g. produced by `createArkObjectType`). Returns the connection class
 * plus the edge / pageInfo classes for advanced use.
 *
 * @example
 *     const Book = createArkObjectType(BookSchema, { name: 'Book' });
 *     const { connection: BookConnection } = createArkConnectionType(Book, 'Book');
 *
 *     @Resolver()
 *     class BooksResolver {
 *         @ArkQuery(BookSchema, { returnType: () => BookConnection, name: 'books' })
 *         books(@Args() args: BookListArgs): BookConnectionShape { ... }
 *     }
 */
export function createArkConnectionType<TNode extends new () => unknown>(
    nodeClass: TNode,
    name: string,
    options: CreateArkConnectionTypeOptions = {}
): ArkConnectionType<TNode> {
    const pageInfo = ensurePageInfo();

    class Edge {
        cursor!: string;
        node!: InstanceType<TNode>;
    }
    Object.defineProperty(Edge, 'name', { value: `${name}Edge` });

    Field(() => String, { description: 'Opaque cursor for this edge.' })(Edge.prototype, 'cursor');
    // `nodeClass` is `TNode extends new () => unknown` — too generic for `Field`'s overload picker to infer a
    // concrete options shape, so we widen the thunk to a plain `Function` return for the decorator call only.
    Field(() => nodeClass as Function, { description: `The ${name} carried by this edge.` })(Edge.prototype, 'node');

    ObjectType(`${name}Edge`, {
        description: options.description ?? `Edge wrapping a single ${name} with its cursor.`,
    })(Edge);

    class Connection {
        pageInfo!: unknown;
        edges!: { cursor: string; node: InstanceType<TNode> }[];
    }
    Object.defineProperty(Connection, 'name', { value: `${name}Connection` });

    Field(() => pageInfo, { description: 'Cursor + hasNext/Prev hints for this page.' })(
        Connection.prototype,
        'pageInfo'
    );
    Field(() => [Edge], { description: `Edges in this page, each wrapping a ${name}.` })(
        Connection.prototype,
        'edges'
    );

    ObjectType(`${name}Connection`, {
        description: options.description ?? `A paginated page of ${name} results.`,
    })(Connection);

    return {
        connection: Connection as ArkConnectionType<TNode>['connection'],
        edge: Edge as ArkConnectionType<TNode>['edge'],
        pageInfo,
    };
}
