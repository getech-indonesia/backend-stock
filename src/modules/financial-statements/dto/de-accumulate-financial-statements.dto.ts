import { IsOptional, IsObject } from 'class-validator';

export class DeAccumulateFinancialStatementsDto {
  @IsOptional()
  @IsObject()
  incomeStatement?: any;

  @IsOptional()
  @IsObject()
  balanceSheet?: any;

  @IsOptional()
  @IsObject()
  cashFlow?: any;
}
