import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListingScoreQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  keyword?: string;

  @IsOptional()
  @IsString()
  exchangeId?: string;

  @IsOptional()
  @IsString()
  sectorId?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  sort?: 'asc' | 'desc';
}
