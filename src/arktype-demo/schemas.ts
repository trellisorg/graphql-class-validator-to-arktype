import { type } from 'arktype';

// ArkType schemas — domain shapes only. The GraphQL layer is generated
// from these via `graphql-arktype` factories in dtos.ts.

export const OrderStatusSchema = type("'PENDING' | 'PAID' | 'SHIPPED' | 'CANCELLED'");
export type OrderStatus = typeof OrderStatusSchema.infer;

export const AuthorSchema = type({
  id: 'string.uuid.v4',
  name: 'string > 0 & string <= 256',
});
export type Author = typeof AuthorSchema.infer;

export const BookSchema = type({
  id: 'string.uuid.v4',
  title: 'string > 0 & string <= 512',
  publishedYear: '1500 <= number.integer <= 3000',
  author: AuthorSchema,
});
export type Book = typeof BookSchema.infer;

// Used as both the input and output for create/get-book operations.
export const CreateBookInputSchema = type({
  title: 'string > 0 & string <= 512',
  publishedYear: '1500 <= number.integer <= 3000',
  authorId: 'string.uuid.v4',
});

export const ListBooksArgsSchema = type({
  'limit?': '1 <= number.integer <= 100',
  'offset?': 'number.integer >= 0',
  'status?': OrderStatusSchema,
});

export const PlaceOrderInputSchema = type({
  bookIds: type('string.uuid.v4').array().atLeastLength(1).atMostLength(50),
  status: OrderStatusSchema,
  notes: 'string <= 1000',
});

export const OrderSchema = type({
  id: 'string.uuid.v4',
  bookIds: type('string.uuid.v4').array(),
  status: OrderStatusSchema,
  notes: 'string',
  totalCents: 'number.integer >= 0',
});
export type Order = typeof OrderSchema.infer;
