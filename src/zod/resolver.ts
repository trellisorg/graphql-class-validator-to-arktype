import { Mutation, Query, Resolver } from '@nestjs/graphql';
import { CartSummaryInput, CartSummaryResult } from './dtos';
import { ZodArgs } from './graphql-zod';

@Resolver()
export class CartResolver {
    @Query(() => String)
    ping(): string {
        return 'pong';
    }

    @Mutation(() => CartSummaryResult)
    processCart(@ZodArgs('input', CartSummaryInput) input: any): CartSummaryResult {
        let totalCents = 0;
        for (const item of input.items) {
            totalCents += item.quantity * item.unitPriceCents;
        }
        return {
            cartId: input.cartId,
            itemCount: input.items.length,
            totalCents,
        };
    }
}
