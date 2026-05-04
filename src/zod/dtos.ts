import { Field, Int, ObjectType } from '@nestjs/graphql';
import { z } from 'zod';
import { createZodInputType } from './graphql-zod';

// Zod v4 schemas — same shape and constraints as the ArkType path so the
// Validation work being measured is equivalent.
export const TagSchema = z.object({
    name: z.string().min(1).max(64),
    tagId: z.uuid(),
});

export const SponsorSchema = z.object({
    label: z.string().min(1).max(128),
    sponsorId: z.uuid(),
    weight: z.number().int().min(1).max(1_000_000),
});

export const CartItemSchema = z.object({
    itemId: z.uuid(),
    notes: z.string().max(1000),
    quantity: z.number().int().min(1).max(10_000),
    sponsors: z.array(SponsorSchema).max(64),
    tags: z.array(TagSchema).max(64),
    unitPriceCents: z.number().int().min(0).max(10_000_000),
});

export const CartSummarySchema = z.object({
    cartId: z.uuid(),
    channel: z.string().min(1),
    currency: z.string().length(3),
    items: z.array(CartItemSchema).min(1).max(500),
    userId: z.uuid(),
});

export const TagInput = createZodInputType(TagSchema, { name: 'TagInput' });
export const SponsorInput = createZodInputType(SponsorSchema, { name: 'SponsorInput' });

export const CartItemInput = createZodInputType(CartItemSchema, {
    fields: {
        sponsors: () => [SponsorInput],
        tags: () => [TagInput],
    },
    name: 'CartItemInput',
});

export const CartSummaryInput = createZodInputType(CartSummarySchema, {
    fields: {
        items: () => [CartItemInput],
    },
    name: 'CartSummaryInput',
});

@ObjectType()
export class CartSummaryResult {
    @Field(() => Int)
    itemCount!: number;

    @Field(() => Int)
    totalCents!: number;

    @Field()
    cartId!: string;
}
