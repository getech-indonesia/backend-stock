import {
    IsArray,
    IsObject,
} from 'class-validator';

export class NormalizedStockDto {

    @IsObject()
    company!: {
        legalName: string;

        displayName: string;

        description?: string;

        website?: string;

        logoUrl?: string;

        ceo?: string;

        foundedYear?: number;

        employeeCount?: number;
    };

    @IsObject()
    country!: {
        code: string;
    };

    @IsObject()
    sector!: {
        name: string;
    };

    @IsObject()
    industry!: {
        name: string;
    };

    @IsObject()
    listing!: {
        symbol: string;

        exchangeCode: string;

        assetType: string;
    };

    @IsArray()
    tags!: string[];
}