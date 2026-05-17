import {
    IsOptional,
    IsString,
    IsUrl,
} from 'class-validator';

export class RawStockDto {
    @IsString()
    symbol!: string;

    @IsString()
    companyName!: string;

    @IsOptional()
    @IsString()
    legalName?: string;

    @IsOptional()
    @IsString()
    displayName?: string;

    @IsString()
    exchangeCode!: string;

    @IsString()
    countryCode!: string;

    @IsOptional()
    @IsString()
    sectorName?: string;

    @IsOptional()
    @IsString()
    industryName?: string;

    @IsOptional()
    @IsUrl()
    website?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsString()
    ceo?: string;

    @IsOptional()
    @IsString()
    headquarters?: string;

    @IsOptional()
    foundedYear?: number;

    @IsOptional()
    employeeCount?: number;
}
