import { z } from 'zod';

export const OrderStatusSchema = z.enum(['PENDING', 'PAID', 'SHIPPED', 'CANCELLED']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const AuthorSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1).max(256),
});
export type Author = z.infer<typeof AuthorSchema>;

export const BookSchema = z.object({
    author: AuthorSchema,
    id: z.uuid(),
    publishedYear: z.number().int().min(1500).max(3000),
    title: z.string().min(1).max(512),
});
export type Book = z.infer<typeof BookSchema>;

export const CreateBookInputSchema = z.object({
    authorId: z.uuid(),
    publishedYear: z.number().int().min(1500).max(3000),
    title: z.string().min(1).max(512),
});

export const ListBooksArgsSchema = z.object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    status: OrderStatusSchema.optional(),
});

export const PlaceOrderInputSchema = z.object({
    bookIds: z.array(z.uuid()).min(1).max(50),
    notes: z.string().max(1000),
    status: OrderStatusSchema,
});

export const OrderSchema = z.object({
    bookIds: z.array(z.uuid()),
    id: z.uuid(),
    notes: z.string(),
    status: OrderStatusSchema,
    totalCents: z.number().int().min(0),
});
export type Order = z.infer<typeof OrderSchema>;
