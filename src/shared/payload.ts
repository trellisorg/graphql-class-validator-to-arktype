// Generates a synthetic CartSummary payload that mirrors the shape of Aurora's
// `sharedFeatureAuroraCartSummary` mutation (the worst offender per the ANR
// profile). The exact field names don't matter — what matters for the benchmark
// is depth, breadth, and the mix of validations (uuid, int, string, nested).

export interface SponsorPayload {
  sponsorId: string;
  weight: number;
  label: string;
}

export interface TagPayload {
  tagId: string;
  name: string;
}

export interface CartItemPayload {
  itemId: string;
  quantity: number;
  unitPriceCents: number;
  notes: string;
  tags: TagPayload[];
  sponsors: SponsorPayload[];
}

export interface CartSummaryPayload {
  cartId: string;
  userId: string;
  currency: string;
  channel: string;
  items: CartItemPayload[];
}

const UUID_NS = '00000000-0000-4000-8000-';

function uuid(seed: number): string {
  return UUID_NS + seed.toString(16).padStart(12, '0');
}

export function buildCartPayload(opts: {
  itemCount: number;
  tagsPerItem: number;
  sponsorsPerItem: number;
}): CartSummaryPayload {
  const items: CartItemPayload[] = [];
  for (let i = 0; i < opts.itemCount; i++) {
    const tags: TagPayload[] = [];
    for (let t = 0; t < opts.tagsPerItem; t++) {
      tags.push({ tagId: uuid(i * 1000 + t), name: `tag-${i}-${t}` });
    }
    const sponsors: SponsorPayload[] = [];
    for (let s = 0; s < opts.sponsorsPerItem; s++) {
      sponsors.push({
        sponsorId: uuid(i * 100000 + s),
        weight: s + 1,
        label: `sponsor-${i}-${s}`,
      });
    }
    items.push({
      itemId: uuid(i),
      quantity: 1 + (i % 5),
      unitPriceCents: 100 + i,
      notes: `notes-${i}`,
      tags,
      sponsors,
    });
  }
  return {
    cartId: uuid(0xc007),
    userId: uuid(0x0fa7),
    currency: 'USD',
    channel: 'web',
    items,
  };
}
