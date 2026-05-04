import { type } from 'arktype';

// ArkType schemas — domain shapes only. The GraphQL layer is generated
// From these via `graphql-arktype` factories in dtos.ts.

export const OrderStatusSchema = type("'PENDING' | 'PAID' | 'SHIPPED' | 'CANCELLED'");
export type OrderStatus = typeof OrderStatusSchema.infer;

export const AuthorSchema = type({
    id: 'string.uuid.v4',
    name: 'string > 0 & string <= 256',
});
export type Author = typeof AuthorSchema.infer;

export const BookSchema = type({
    author: AuthorSchema,
    id: 'string.uuid.v4',
    publishedYear: '1500 <= number.integer <= 3000',
    title: 'string > 0 & string <= 512',
});
export type Book = typeof BookSchema.infer;

// Used as both the input and output for create/get-book operations.
export const CreateBookInputSchema = type({
    authorId: 'string.uuid.v4',
    publishedYear: '1500 <= number.integer <= 3000',
    title: 'string > 0 & string <= 512',
});

export const ListBooksArgsSchema = type({
    'limit?': '1 <= number.integer <= 100',
    'offset?': 'number.integer >= 0',
    'status?': OrderStatusSchema,
});

export const PlaceOrderInputSchema = type({
    bookIds: type('string.uuid.v4').array().atLeastLength(1).atMostLength(50),
    notes: 'string <= 1000',
    status: OrderStatusSchema,
});

export const OrderSchema = type({
    bookIds: type('string.uuid.v4').array(),
    id: 'string.uuid.v4',
    notes: 'string',
    status: OrderStatusSchema,
    totalCents: 'number.integer >= 0',
});
export type Order = typeof OrderSchema.infer;
