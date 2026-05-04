import { Args, Resolver } from '@nestjs/graphql';
import { ZodArgs, ZodMutation, ZodQuery } from '../zod/graphql-zod';
import { Book as BookGql, CreateBookInput, ListBooksArgs, PlaceOrderInput, UpdateBookInput } from './dtos';
import { type Author, type Book, BookSchema, type Order, OrderSchema } from './schemas';

const authors = new Map<string, Author>();
const books = new Map<string, Book>();
const orders = new Map<string, Order>();

@Resolver()
export class DemoResolver {
    @ZodQuery(BookSchema.array(), { name: 'books', returnType: () => [BookGql] })
    listBooks(@Args() args: ListBooksArgs): Book[] {
        let out = [...books.values()];
        if (args.offset) {
            out = out.slice(args.offset);
        }
        if (args.limit) {
            out = out.slice(0, args.limit);
        }
        return out;
    }

    @ZodQuery(BookSchema, { name: 'book', nullable: true })
    getBook(@Args('id') id: string): Book | null {
        return books.get(id) ?? null;
    }

    @ZodMutation(BookSchema, { name: 'createBook', validate: true })
    createBook(@ZodArgs('input', CreateBookInput) input: any): Book {
        if (!authors.get(input.authorId)) {
            authors.set(input.authorId, { id: input.authorId, name: 'Default Author' });
        }
        const id = stableId(input.title);
        const book: Book = {
            author: authors.get(input.authorId)!,
            id,
            publishedYear: input.publishedYear,
            title: input.title,
        };
        books.set(id, book);
        return book;
    }

    @ZodMutation(BookSchema, { name: 'updateBook' })
    updateBook(@Args('id') id: string, @ZodArgs('input', UpdateBookInput) patch: any): Book {
        const existing = books.get(id);
        if (!existing) {
            throw new Error(`book ${id} not found`);
        }
        const updated: Book = { ...existing, ...patch };
        books.set(id, updated);
        return updated;
    }

    @ZodMutation(OrderSchema, { name: 'placeOrder', validate: true })
    placeOrder(@ZodArgs('input', PlaceOrderInput) input: any): Order {
        const order: Order = {
            bookIds: input.bookIds,
            id: stableId(input.bookIds.join(',')),
            notes: input.notes,
            status: input.status,
            totalCents: input.bookIds.length * 1000,
        };
        orders.set(order.id, order);
        return order;
    }
}

function stableId(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const hex = (h.toString(16) + '0'.repeat(12)).slice(0, 12);
    return `00000000-0000-4000-8000-${hex}`;
}
