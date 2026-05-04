import { Args, Resolver } from '@nestjs/graphql';
import { ArkArgs, ArkMutation, ArkQuery } from '../arktype/graphql-arktype';
import {
  AuthorSchema,
  BookSchema,
  ListBooksArgsSchema,
  OrderSchema,
  PlaceOrderInputSchema,
  CreateBookInputSchema,
  type Author,
  type Book,
  type Order,
} from './schemas';
import {
  Book as BookGql,
  CreateBookInput,
  ListBooksArgs,
  Order as OrderGql,
  PlaceOrderInput,
  UpdateBookInput,
} from './dtos';

// In-memory state for the demo so we don't need a database to exercise the
// full library surface end-to-end.
const authors = new Map<string, Author>();
const books = new Map<string, Book>();
const orders = new Map<string, Order>();

@Resolver()
export class DemoResolver {
  @ArkQuery(BookSchema.array(), { name: 'books', returnType: () => [BookGql] })
  listBooks(@Args() args: ListBooksArgs): Book[] {
    let out = [...books.values()];
    if (args.status) out = out.filter((b) => true); // status filtering omitted for brevity
    if (args.offset) out = out.slice(args.offset);
    if (args.limit) out = out.slice(0, args.limit);
    return out;
  }

  @ArkQuery(BookSchema, { name: 'book', nullable: true })
  getBook(@Args('id') id: string): Book | null {
    return books.get(id) ?? null;
  }

  @ArkMutation(BookSchema, { name: 'createBook', validate: true })
  createBook(@ArkArgs('input', CreateBookInput) input: any): Book {
    const author = authors.get(input.authorId);
    if (!author) {
      // Seed an author so the demo can show validation passing.
      const seeded: Author = { id: input.authorId, name: 'Default Author' };
      authors.set(seeded.id, seeded);
    }
    const id = stableId(input.title);
    const book: Book = {
      id,
      title: input.title,
      publishedYear: input.publishedYear,
      author: authors.get(input.authorId)!,
    };
    books.set(id, book);
    return book;
  }

  @ArkMutation(BookSchema, { name: 'updateBook' })
  updateBook(
    @Args('id') id: string,
    @ArkArgs('input', UpdateBookInput) patch: any,
  ): Book {
    const existing = books.get(id);
    if (!existing) throw new Error(`book ${id} not found`);
    const updated: Book = { ...existing, ...patch };
    books.set(id, updated);
    return updated;
  }

  @ArkMutation(OrderSchema, { name: 'placeOrder', validate: true })
  placeOrder(@ArkArgs('input', PlaceOrderInput) input: any): Order {
    const order: Order = {
      id: stableId(input.bookIds.join(',')),
      bookIds: input.bookIds,
      status: input.status,
      notes: input.notes,
      totalCents: input.bookIds.length * 1000,
    };
    orders.set(order.id, order);
    return order;
  }
}

function stableId(seed: string): string {
  // Deterministic v4-style UUID built from the seed so the demo's responses
  // pass the schema's `string.uuid.v4` constraint regardless of input.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = (h.toString(16) + '0'.repeat(12)).slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
}
