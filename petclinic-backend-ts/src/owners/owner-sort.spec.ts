import { BadRequestException } from '@nestjs/common';
import { buildSortOrder } from './owner-sort';

/**
 * Unit tests for the sort-chain expansion: a single client column expands to
 * a stable multi-field ORDER BY chain that always ends in `owner.id ASC`.
 * The result is an OrderByCondition object whose key order IS the ORDER BY
 * order (applied via QueryBuilder.orderBy).
 */
describe('buildSortOrder', () => {
  it('expands lastName to lastName, firstName, id ASC', () => {
    expect(buildSortOrder('lastName,asc')).toEqual({
      'owner.lastName': 'ASC',
      'owner.firstName': 'ASC',
      'owner.id': 'ASC',
    });
  });

  it('expands city to city, lastName, firstName, id ASC', () => {
    expect(buildSortOrder('city,asc')).toEqual({
      'owner.city': 'ASC',
      'owner.lastName': 'ASC',
      'owner.firstName': 'ASC',
      'owner.id': 'ASC',
    });
  });

  it('expands address to address, lastName, firstName, id ASC', () => {
    expect(buildSortOrder('address,asc')).toEqual({
      'owner.address': 'ASC',
      'owner.lastName': 'ASC',
      'owner.firstName': 'ASC',
      'owner.id': 'ASC',
    });
  });

  it('falls back to id ASC without a sort param', () => {
    expect(buildSortOrder(undefined)).toEqual({ 'owner.id': 'ASC' });
  });

  it('desc flips the whole chain except the id tiebreaker', () => {
    expect(buildSortOrder('lastName,desc')).toEqual({
      'owner.lastName': 'DESC',
      'owner.firstName': 'DESC',
      'owner.id': 'ASC',
    });
  });

  it('preserves the chain order of the keys', () => {
    expect(Object.keys(buildSortOrder('city,asc'))).toEqual([
      'owner.city',
      'owner.lastName',
      'owner.firstName',
      'owner.id',
    ]);
  });

  it('rejects an unknown column', () => {
    expect(() => buildSortOrder('pets,asc')).toThrow(BadRequestException);
  });

  it('rejects an unknown direction', () => {
    expect(() => buildSortOrder('city,sideways')).toThrow(BadRequestException);
  });
});
