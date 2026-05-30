import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const RANGE_VALUES = ['6m', '1y', '2y', '5y'] as const;
const INTERVAL_VALUES = ['1d', '1w', '1mo'] as const;

export class TechnicalSeriesQueryDto {
  @IsOptional()
  @IsIn(RANGE_VALUES)
  range?: (typeof RANGE_VALUES)[number] = '1y';

  @IsOptional()
  @IsIn(INTERVAL_VALUES)
  interval?: (typeof INTERVAL_VALUES)[number] = '1mo';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(2000)
  limit?: number;
}
