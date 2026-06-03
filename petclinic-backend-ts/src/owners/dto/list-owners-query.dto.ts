import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query parameters for GET /api/owners: free-text filter + pagination.
 * `page` and `size` arrive as strings and are coerced via @Type — the global
 * ValidationPipe runs with `enableImplicitConversion: false`.
 */
export class ListOwnersQueryDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Search query (case-insensitive contains filter over name, address, city, telephone, pet names)',
  })
  q?: string = '';

  @Type(() => Number)
  @IsInt({ message: 'must be an integer' })
  @Min(0, { message: 'must be greater than or equal to 0' })
  @ApiPropertyOptional({ description: 'Page index (0-based).', default: 0 })
  page: number = 0;

  @Type(() => Number)
  @IsInt({ message: 'must be an integer' })
  @Min(1, { message: 'must be greater than or equal to 1' })
  @Max(100, { message: 'must be less than or equal to 100' })
  @ApiPropertyOptional({ description: 'Page size (1–100).', default: 10 })
  size: number = 10;

  // Column whitelist + direction are validated in buildSortOrder (400 on
  // anything outside lastName|city|address × asc|desc).
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: "Sort spec in 'col,dir' format; col ∈ lastName|city|address, dir ∈ asc|desc.",
    example: 'lastName,asc',
  })
  sort?: string;
}
