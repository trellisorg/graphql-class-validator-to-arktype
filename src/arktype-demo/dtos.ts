import { ArgsType } from '@nestjs/graphql';
import {
  arkOmit,
  arkPartial,
  arkPick,
  createArkArgsType,
  createArkInputType,
  createArkObjectType,
  registerArkEnum,
} from '../arktype/graphql-arktype';
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

export const OrderStatus = registerArkEnum(OrderStatusSchema, {
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
// Order matters: register children before parents so nested-type lookup works
// without manual `fields:` overrides. Author has no nested objects, so it
// resolves on its own. Book references Author via the registry.

export const Author = createArkObjectType(AuthorSchema, {
  name: 'Author',
  description: 'A book author.',
});

export const Book = createArkObjectType(BookSchema, {
  name: 'Book',
  description: 'A book in the catalog.',
});

export const Order = createArkObjectType(OrderSchema, {
  name: 'Order',
  fields: {
    status: () => OrderStatus.gqlEnumRef,
  },
});

// ---- Input types ---------------------------------------------------------

export const CreateBookInput = createArkInputType(CreateBookInputSchema, {
  name: 'CreateBookInput',
  description: 'Payload to create a new book.',
});

export const PlaceOrderInput = createArkInputType(PlaceOrderInputSchema, {
  name: 'PlaceOrderInput',
  fields: {
    status: () => OrderStatus.gqlEnumRef,
  },
});

// ---- Type helpers --------------------------------------------------------
// Demonstrates all four PartialType / PickType / OmitType analogues.

export const UpdateBookInput = arkPartial(CreateBookInput, {
  name: 'UpdateBookInput',
  description: 'Patch payload — every field is optional.',
});

export const BookSummary = arkPick(Book, ['id', 'title'] as const, {
  name: 'BookSummary',
  description: 'Listing-page projection of Book.',
});

export const PublicAuthor = arkOmit(Author, ['id'] as const, {
  name: 'PublicAuthor',
});

// ---- Args types (resolver argument bundles) ------------------------------
// Mirrors NestJS PartialType convention: when subclassing a generated class,
// re-apply the type decorator so the subclass is registered.

@ArgsType()
export class ListBooksArgs extends createArkArgsType(ListBooksArgsSchema, {
  name: 'ListBooksArgs',
  fields: {
    status: () => OrderStatus.gqlEnumRef,
  },
}) {}
