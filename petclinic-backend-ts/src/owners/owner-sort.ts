import { BadRequestException } from '@nestjs/common';
import { OrderByCondition } from 'typeorm';

/**
 * Sort-chain expansion for the owners list: each sortable column expands to a
 * stable multi-field chain so that pagination stays deterministic with
 * duplicate values. `owner.id ASC` is always appended as the final tiebreaker.
 */
const SORT_CHAINS: Record<string, string[]> = {
  lastName: ['owner.lastName', 'owner.firstName'],
  city: ['owner.city', 'owner.lastName', 'owner.firstName'],
  address: ['owner.address', 'owner.lastName', 'owner.firstName'],
};

/**
 * Expands a `col,dir` sort param into a QueryBuilder OrderByCondition.
 * The requested direction applies to the whole chain; the trailing `owner.id`
 * tiebreaker always stays ASC. No sort param falls back to `owner.id ASC`.
 * Unknown columns or directions are rejected with a 400 BadRequestException
 * (rendered as RFC-7807 ProblemDetail by the global filter).
 */
export function buildSortOrder(sortParam?: string): OrderByCondition {
  if (!sortParam) {
    return { 'owner.id': 'ASC' };
  }
  const [column, direction = 'asc'] = sortParam.split(',');
  const chain = SORT_CHAINS[column];
  if (!chain) {
    throw new BadRequestException(`Unknown sort column: ${column}`);
  }
  if (direction !== 'asc' && direction !== 'desc') {
    throw new BadRequestException(`Unknown sort direction: ${direction}`);
  }
  const order: OrderByCondition = {};
  for (const field of chain) {
    order[field] = direction === 'desc' ? 'DESC' : 'ASC';
  }
  order['owner.id'] = 'ASC';
  return order;
}
