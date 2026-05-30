import { IsIn, IsOptional } from 'class-validator';

const METRIC_VALUES = ['netIncome', 'eps', 'revenue'] as const;

export class KeyStatisticsQueryDto {
  @IsOptional()
  @IsIn(METRIC_VALUES)
  metric?: (typeof METRIC_VALUES)[number] = 'netIncome';
}

