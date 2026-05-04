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
    description: 'Status of a customer order through fulfilment.',
    name: 'OrderStatus',
    valuesMap: {
        CANCELLED: { description: 'Cancelled by user or system' },
        PAID: { description: 'Payment captured, ready to ship' },
        PENDING: { description: 'Awaiting payment' },
        SHIPPED: { description: 'Handed off to the carrier' },
    },
});

// ---- Object (output) types -----------------------------------------------
// Order matters: register children before parents so nested-type lookup works
// Without manual `fields:` overrides. Author has no nested objects, so it
// Resolves on its own. Book references Author via the registry.

export const Author = createArkObjectType(AuthorSchema, {
    description: 'A book author.',
    name: 'Author',
});

export const Book = createArkObjectType(BookSchema, {
    description: 'A book in the catalog.',
    name: 'Book',
});

export const Order = createArkObjectType(OrderSchema, {
    fields: {
        status: () => OrderStatus.gqlEnumRef,
    },
    name: 'Order',
});

// ---- Input types ---------------------------------------------------------

export const CreateBookInput = createArkInputType(CreateBookInputSchema, {
    description: 'Payload to create a new book.',
    name: 'CreateBookInput',
});

export const PlaceOrderInput = createArkInputType(PlaceOrderInputSchema, {
    fields: {
        status: () => OrderStatus.gqlEnumRef,
    },
    name: 'PlaceOrderInput',
});

// ---- Type helpers --------------------------------------------------------
// Demonstrates all four PartialType / PickType / OmitType analogues.

export const UpdateBookInput = arkPartial(CreateBookInput, {
    description: 'Patch payload — every field is optional.',
    name: 'UpdateBookInput',
});

export const BookSummary = arkPick(Book, ['id', 'title'] as const, {
    description: 'Listing-page projection of Book.',
    name: 'BookSummary',
});

export const PublicAuthor = arkOmit(Author, ['id'] as const, {
    name: 'PublicAuthor',
});

// ---- Args types (resolver argument bundles) ------------------------------
// Mirrors NestJS PartialType convention: when subclassing a generated class,
// Re-apply the type decorator so the subclass is registered.

@ArgsType()
export class ListBooksArgs extends createArkArgsType(ListBooksArgsSchema, {
    fields: {
        status: () => OrderStatus.gqlEnumRef,
    },
    name: 'ListBooksArgs',
}) {}
