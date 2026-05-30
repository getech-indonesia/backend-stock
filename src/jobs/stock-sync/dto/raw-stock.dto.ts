import {
    IsOptional,
    IsString,
    IsUrl,
} from 'class-validator';

type RawDividendDto = {
    type?: string;
    fiscalYear?: number;
    declaredDate?: Date;
    exDividendDate?: Date;
    recordDate?: Date;
    paymentDate?: Date;
    dps?: number;
    cashDividendTotal?: number;
    currency?: string;
};

type RawManagementMemberDto = {
    name: string;
    position: string;
    group: 'DIRECTOR' | 'COMMISSIONER';
};

type RawShareholderDto = {
    name: string;
    category?: string;
    sharesHeld?: number;
    percentageOwned?: number;
};

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

    @IsOptional()
    dividends?: RawDividendDto[];

    @IsOptional()
    managementMembers?: RawManagementMemberDto[];

    @IsOptional()
    shareholders?: RawShareholderDto[];
}
