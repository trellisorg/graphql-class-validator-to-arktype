import { z } from 'zod';

export const OrderStatusSchema = z.enum(['PENDING', 'PAID', 'SHIPPED', 'CANCELLED']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const AuthorSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(256),
});
export type Author = z.infer<typeof AuthorSchema>;

export const BookSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(512),
  publishedYear: z.number().int().min(1500).max(3000),
  author: AuthorSchema,
});
export type Book = z.infer<typeof BookSchema>;

export const CreateBookInputSchema = z.object({
  title: z.string().min(1).max(512),
  publishedYear: z.number().int().min(1500).max(3000),
  authorId: z.uuid(),
});

export const ListBooksArgsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  status: OrderStatusSchema.optional(),
});

export const PlaceOrderInputSchema = z.object({
  bookIds: z.array(z.uuid()).min(1).max(50),
  status: OrderStatusSchema,
  notes: z.string().max(1000),
});

export const OrderSchema = z.object({
  id: z.uuid(),
  bookIds: z.array(z.uuid()),
  status: OrderStatusSchema,
  notes: z.string(),
  totalCents: z.number().int().min(0),
});
export type Order = z.infer<typeof OrderSchema>;
