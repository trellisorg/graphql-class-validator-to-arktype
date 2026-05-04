import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CartSummaryInput, CartSummaryResult } from './dtos';

@Resolver()
export class CartResolver {
  @Query(() => String)
  ping(): string {
    return 'pong';
  }

  @Mutation(() => CartSummaryResult)
  processCart(@Args('input') input: CartSummaryInput): CartSummaryResult {
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
