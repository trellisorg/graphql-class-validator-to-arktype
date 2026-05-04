import { ArgsType } from '@nestjs/graphql';
import {
  createZodArgsType,
  createZodInputType,
  createZodObjectType,
  registerZodEnum,
  zodOmit,
  zodPartial,
  zodPick,
} from '../zod/graphql-zod';
import {
  AuthorSchema,
  BookSchema,
  CreateBookInputSchema,
  ListBooksArgsSchema,
  OrderSchema,
  OrderStatusSchema,
  PlaceOrderInputSchema,
} from './schemas';

// ---- Enums ----------------------------------------------------------------

export const OrderStatus = registerZodEnum(OrderStatusSchema, {
  name: 'OrderStatus',
  description: 'Status of a customer order through fulfilment.',
  valuesMap: {
    PENDING: { description: 'Awaiting payment' },
    PAID: { description: 'Payment captured, ready to ship' },
    SHIPPED: { description: 'Handed off to the carrier' },
    CANCELLED: { description: 'Cancelled by user or system' },
  },
});

// ---- Object (output) types -----------------------------------------------

export const Author = createZodObjectType(AuthorSchema, {
  name: 'Author',
  description: 'A book author.',
});

export const Book = createZodObjectType(BookSchema, {
  name: 'Book',
  description: 'A book in the catalog.',
});

export const Order = createZodObjectType(OrderSchema, {
  name: 'Order',
  fields: {
    status: () => OrderStatus.gqlEnumRef,
  },
});

// ---- Input types ---------------------------------------------------------

export const CreateBookInput = createZodInputType(CreateBookInputSchema, {
  name: 'CreateBookInput',
  description: 'Payload to create a new book.',
});

export const PlaceOrderInput = createZodInputType(PlaceOrderInputSchema, {
  name: 'PlaceOrderInput',
  fields: {
    status: () => OrderStatus.gqlEnumRef,
  },
});

// ---- Type helpers --------------------------------------------------------

export const UpdateBookInput = zodPartial(CreateBookInput, {
  name: 'UpdateBookInput',
  description: 'Patch payload — every field is optional.',
});

export const BookSummary = zodPick(Book, ['id', 'title'] as const, {
  name: 'BookSummary',
  description: 'Listing-page projection of Book.',
});

export const PublicAuthor = zodOmit(Author, ['id'] as const, {
  name: 'PublicAuthor',
});

// ---- Args types ----------------------------------------------------------

@ArgsType()
export class ListBooksArgs extends createZodArgsType(ListBooksArgsSchema, {
  name: 'ListBooksArgs',
  fields: {
    status: () => OrderStatus.gqlEnumRef,
  },
}) {}
