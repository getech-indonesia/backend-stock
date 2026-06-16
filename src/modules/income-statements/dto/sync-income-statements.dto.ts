import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SyncIncomeStatementsDto {
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsOptional()
  @IsUUID()
  sectorId?: string;
}
