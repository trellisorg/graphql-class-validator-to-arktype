import { Field, Int, ObjectType } from '@nestjs/graphql';
import { type } from 'arktype';
import { createArkInputType } from './graphql-arktype';

// ArkType schemas. These are the source of truth for both runtime validation
// and GraphQL InputType generation — there's no separate decorator layer.
export const TagSchema = type({
  tagId: 'string.uuid.v4',
  name: 'string > 0 & string <= 64',
});

export const SponsorSchema = type({
  sponsorId: 'string.uuid.v4',
  weight: '1 <= number.integer <= 1000000',
  label: 'string > 0 & string <= 128',
});

export const CartItemSchema = type({
  itemId: 'string.uuid.v4',
  quantity: '1 <= number.integer <= 10000',
  unitPriceCents: '0 <= number.integer <= 10000000',
  notes: 'string <= 1000',
  tags: TagSchema.array().atMostLength(64),
  sponsors: SponsorSchema.array().atMostLength(64),
});

export const CartSummarySchema = type({
  cartId: 'string.uuid.v4',
  userId: 'string.uuid.v4',
  currency: 'string == 3',
  channel: 'string > 0',
  items: CartItemSchema.array().atLeastLength(1).atMostLength(500),
});

// Generate the GraphQL InputType classes from those schemas. Order matters —
// nested types must exist before parents reference them.
export const TagInput = createArkInputType(TagSchema, { name: 'TagInput' });
export const SponsorInput = createArkInputType(SponsorSchema, { name: 'SponsorInput' });

export const CartItemInput = createArkInputType(CartItemSchema, {
  name: 'CartItemInput',
  fields: {
    tags: () => [TagInput],
    sponsors: () => [SponsorInput],
  },
});

export const CartSummaryInput = createArkInputType(CartSummarySchema, {
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

export type CartSummaryInputType = typeof CartSummarySchema.infer;
