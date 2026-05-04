import { Mutation, Query, Resolver } from '@nestjs/graphql';
import { ZodArgs } from './graphql-zod';
import { CartSummaryInput, CartSummaryResult } from './dtos';

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
      itemCount: input.items.length,
      totalCents,
      cartId: input.cartId,
    };
  }
}
