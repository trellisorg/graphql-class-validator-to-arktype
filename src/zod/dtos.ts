import { Field, Int, ObjectType } from '@nestjs/graphql';
import { z } from 'zod';
import { createZodInputType } from './graphql-zod';

// Zod v4 schemas — same shape and constraints as the ArkType path so the
// validation work being measured is equivalent.
export const TagSchema = z.object({
  tagId: z.uuid(),
  name: z.string().min(1).max(64),
});

export const SponsorSchema = z.object({
  sponsorId: z.uuid(),
  weight: z.number().int().min(1).max(1_000_000),
  label: z.string().min(1).max(128),
});

export const CartItemSchema = z.object({
  itemId: z.uuid(),
  quantity: z.number().int().min(1).max(10_000),
  unitPriceCents: z.number().int().min(0).max(10_000_000),
  notes: z.string().max(1000),
  tags: z.array(TagSchema).max(64),
  sponsors: z.array(SponsorSchema).max(64),
});

export const CartSummarySchema = z.object({
  cartId: z.uuid(),
  userId: z.uuid(),
  currency: z.string().length(3),
  channel: z.string().min(1),
  items: z.array(CartItemSchema).min(1).max(500),
});

export const TagInput = createZodInputType(TagSchema, { name: 'TagInput' });
export const SponsorInput = createZodInputType(SponsorSchema, { name: 'SponsorInput' });

export const CartItemInput = createZodInputType(CartItemSchema, {
  name: 'CartItemInput',
  fields: {
    tags: () => [TagInput],
    sponsors: () => [SponsorInput],
  },
});

export const CartSummaryInput = createZodInputType(CartSummarySchema, {
  name: 'CartSummaryInput',
  fields: {
    items: () => [CartItemInput],
  },
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
