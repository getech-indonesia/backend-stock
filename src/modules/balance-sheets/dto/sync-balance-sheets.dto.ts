import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SyncBalanceSheetsDto {
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsOptional()
  @IsUUID()
  sectorId?: string;
}
