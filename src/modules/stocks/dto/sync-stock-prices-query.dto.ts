import { IsOptional, IsUUID } from 'class-validator';

export class SyncStockPricesQueryDto {
  @IsOptional()
  @IsUUID()
  listingId?: string;
}
