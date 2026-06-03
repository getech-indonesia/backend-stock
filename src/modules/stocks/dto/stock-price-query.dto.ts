import { Transform } from 'class-transformer';
import { IsDateString, IsUUID } from 'class-validator';

export class StockPriceQueryDto {
    @IsUUID()
    listingId: string;

    @IsDateString()
    @Transform(({ value }) =>
        typeof value === 'string'
            ? value.trim()
            : value,
    )
    date: string;
}