import { ApiProperty } from '@nestjs/swagger';

/**
 * Generic page envelope for paginated list endpoints, mirroring the
 * Spring Data `Page` shape: `content` + paging metadata.
 *
 * The `content` element type is generic, so controllers document the
 * concrete shape with `@ApiExtraModels` + an `allOf` schema override
 * on their `@ApiOkResponse`.
 */
export class PageDto<T> {
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'The items of the current page.',
  })
  content!: T[];

  @ApiProperty({ example: 42, description: 'Total number of items across all pages.' })
  totalElements!: number;

  @ApiProperty({ example: 5, description: 'Total number of pages.' })
  totalPages!: number;

  @ApiProperty({ example: 0, description: 'Current page index (0-based).' })
  number!: number;

  @ApiProperty({ example: 10, description: 'Page size.' })
  size!: number;
}
