import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const INTERVAL_VALUES = ['1d', '1w', '1mo'] as const;

export class CandlesQueryDto {
  @IsOptional()
  @IsIn(INTERVAL_VALUES)
  interval?: (typeof INTERVAL_VALUES)[number] = '1d';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  limit?: number = 365;

  /** Unix timestamp (seconds); return candles strictly before this time. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  before?: number;
}
