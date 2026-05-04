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

export const Author = createZodObjectType(AuthorSchema, {
    description: 'A book author.',
    name: 'Author',
});

export const Book = createZodObjectType(BookSchema, {
    description: 'A book in the catalog.',
    name: 'Book',
});

export const Order = createZodObjectType(OrderSchema, {
    fields: {
        status: () => OrderStatus.gqlEnumRef,
    },
    name: 'Order',
});

// ---- Input types ---------------------------------------------------------

export const CreateBookInput = createZodInputType(CreateBookInputSchema, {
    description: 'Payload to create a new book.',
    name: 'CreateBookInput',
});

export const PlaceOrderInput = createZodInputType(PlaceOrderInputSchema, {
    fields: {
        status: () => OrderStatus.gqlEnumRef,
    },
    name: 'PlaceOrderInput',
});

// ---- Type helpers --------------------------------------------------------

export const UpdateBookInput = zodPartial(CreateBookInput, {
    description: 'Patch payload — every field is optional.',
    name: 'UpdateBookInput',
});

export const BookSummary = zodPick(Book, ['id', 'title'] as const, {
    description: 'Listing-page projection of Book.',
    name: 'BookSummary',
});

export const PublicAuthor = zodOmit(Author, ['id'] as const, {
    name: 'PublicAuthor',
});

// ---- Args types ----------------------------------------------------------

@ArgsType()
export class ListBooksArgs extends createZodArgsType(ListBooksArgsSchema, {
    fields: {
        status: () => OrderStatus.gqlEnumRef,
    },
    name: 'ListBooksArgs',
}) {}
