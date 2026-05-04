import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    type Author,
    Book,
    CreateBookInput,
    ListBooksArgs,
    Order,
    PlaceOrderInput,
    UpdateBookInput,
} from './dtos';

const authors = new Map<string, Author>();
const books = new Map<string, Book>();
const orders = new Map<string, Order>();

@Resolver()
export class DemoResolver {
    @Query(() => [Book], { name: 'books' })
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

    @Query(() => Book, { name: 'book', nullable: true })
    getBook(@Args('id') id: string): Book | null {
        return books.get(id) ?? null;
    }

    @Mutation(() => Book, { name: 'createBook' })
    createBook(@Args('input') input: CreateBookInput): Book {
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

    @Mutation(() => Book, { name: 'updateBook' })
    updateBook(@Args('id') id: string, @Args('input') patch: UpdateBookInput): Book {
        const existing = books.get(id);
        if (!existing) {
            throw new Error(`book ${id} not found`);
        }
        const updated: Book = { ...existing, ...patch };
        books.set(id, updated);
        return updated;
    }

    @Mutation(() => Order, { name: 'placeOrder' })
    placeOrder(@Args('input') input: PlaceOrderInput): Order {
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
