import { Field, Int, ObjectType } from '@nestjs/graphql';
import { type } from 'arktype';
import { createArkInputType } from './graphql-arktype';

// ArkType schemas. These are the source of truth for both runtime validation
// And GraphQL InputType generation — there's no separate decorator layer.
export const TagSchema = type({
    name: 'string > 0 & string <= 64',
    tagId: 'string.uuid.v4',
});

export const SponsorSchema = type({
    label: 'string > 0 & string <= 128',
    sponsorId: 'string.uuid.v4',
    weight: '1 <= number.integer <= 1000000',
});

export const CartItemSchema = type({
    itemId: 'string.uuid.v4',
    notes: 'string <= 1000',
    quantity: '1 <= number.integer <= 10000',
    sponsors: SponsorSchema.array().atMostLength(64),
    tags: TagSchema.array().atMostLength(64),
    unitPriceCents: '0 <= number.integer <= 10000000',
});

export const CartSummarySchema = type({
    cartId: 'string.uuid.v4',
    channel: 'string > 0',
    currency: 'string == 3',
    items: CartItemSchema.array().atLeastLength(1).atMostLength(500),
    userId: 'string.uuid.v4',
});

// Generate the GraphQL InputType classes from those schemas. Order matters —
// Nested types must exist before parents reference them.
export const TagInput = createArkInputType(TagSchema, { name: 'TagInput' });
export const SponsorInput = createArkInputType(SponsorSchema, { name: 'SponsorInput' });

export const CartItemInput = createArkInputType(CartItemSchema, {
    fields: {
        sponsors: () => [SponsorInput],
        tags: () => [TagInput],
    },
    name: 'CartItemInput',
});

export const CartSummaryInput = createArkInputType(CartSummarySchema, {
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

export type CartSummaryInputType = typeof CartSummarySchema.infer;
