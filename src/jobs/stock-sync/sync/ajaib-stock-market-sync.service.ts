import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import axios, { AxiosError } from 'axios';

import { PrismaService } from '../../../prisma/prisma.service';

type AjaibPriceBreakdownApiItem = {
    pct_change?: number | string | null;
    price?: number | string | null;
    price_change?: number | string | null;
};

type AjaibStockMarketApiItem = {
    code?: string | null;
    market_cap?: number | string | null;
    price?: number | string | null;
    price_1_month?: AjaibPriceBreakdownApiItem | null;
    price_1_week?: AjaibPriceBreakdownApiItem | null;
    volume?: number | string | null;
};

type AjaibStockMarketApiResponse = {
    err_code?: string | null;
    err_message?: string | null;
    result?: {
        count?: number | null;
        results?: AjaibStockMarketApiItem[] | null;
    } | null;
};

@Injectable()
export class AjaibStockMarketSyncService {
    private readonly logger = new Logger(
        AjaibStockMarketSyncService.name,
    );

    private readonly pythonBackendBaseUrl =
        process.env.PYTHON_BACKEND_BASE_URL ??
        'http://127.0.0.1:5000/api';

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async syncAllFromPython(): Promise<{
        listingsProcessed: number;
        listingsSucceeded: number;
        listingsFailed: number;
        listingsSkipped: number;
        upserted: number;
    }> {
        const listings =
            await this.prisma.listing.findMany({
                where: {
                    exchange: {
                        code: 'IDX',
                    },
                },
                select: {
                    id: true,
                    symbol: true,
                },
                orderBy: {
                    createdAt: 'asc',
                },
            });

        const listingBySymbol = new Map(
            listings.map((listing) => [
                listing.symbol.trim().toUpperCase(),
                listing,
            ]),
        );

        const payloads = await this.fetchAjaibStockMarkets();

        if (!payloads) {
            return {
                listingsProcessed: listings.length,
                listingsSucceeded: 0,
                listingsFailed: listings.length,
                listingsSkipped: 0,
                upserted: 0,
            };
        }

        let listingsSucceeded = 0;
        let listingsFailed = 0;
        let listingsSkipped = 0;
        let upserted = 0;

        for (const payload of payloads) {
            const code = payload.code?.trim().toUpperCase();

            if (!code) {
                listingsSkipped++;
                this.logger.warn(
                    `Skipping Ajaib market row because code is missing. payload=${JSON.stringify(payload).slice(0, 200)}`,
                );
                continue;
            }

            const listing = listingBySymbol.get(code);

            if (!listing) {
                listingsSkipped++;
                this.logger.warn(
                    `Skipping Ajaib market row for ${code} because no listing exists in database`,
                );
                continue;
            }

            const marketCap = this.toDecimalOrNull(
                payload.market_cap,
                24,
                2,
            );
            const price = this.toDecimalOrNull(payload.price, 14, 4);
            const volume = this.toBigIntOrNull(payload.volume);

            if (marketCap == null || price == null || volume == null) {
                listingsSkipped++;
                this.logger.warn(
                    `Skipping Ajaib market sync for ${code} because required fields are invalid. payload=${JSON.stringify(payload).slice(0, 200)}`,
                );
                continue;
            }

            const price1Month = payload.price_1_month ?? null;
            const price1Week = payload.price_1_week ?? null;

            await this.prisma.ajaibStockMarket.upsert({
                where: {
                    listingId: listing.id,
                },
                update: {
                    marketCap,
                    price,
                    price1MonthPctChange: this.toDecimalOrNull(
                        price1Month?.pct_change,
                        10,
                        4,
                    ),
                    price1MonthPrice: this.toDecimalOrNull(
                        price1Month?.price,
                        14,
                        4,
                    ),
                    price1MonthPriceChange: this.toDecimalOrNull(
                        price1Month?.price_change,
                        14,
                        4,
                    ),
                    price1WeekPctChange: this.toDecimalOrNull(
                        price1Week?.pct_change,
                        10,
                        4,
                    ),
                    price1WeekPrice: this.toDecimalOrNull(
                        price1Week?.price,
                        14,
                        4,
                    ),
                    price1WeekPriceChange: this.toDecimalOrNull(
                        price1Week?.price_change,
                        14,
                        4,
                    ),
                    volume,
                },
                create: {
                    listingId: listing.id,
                    marketCap,
                    price,
                    price1MonthPctChange: this.toDecimalOrNull(
                        price1Month?.pct_change,
                        10,
                        4,
                    ),
                    price1MonthPrice: this.toDecimalOrNull(
                        price1Month?.price,
                        14,
                        4,
                    ),
                    price1MonthPriceChange: this.toDecimalOrNull(
                        price1Month?.price_change,
                        14,
                        4,
                    ),
                    price1WeekPctChange: this.toDecimalOrNull(
                        price1Week?.pct_change,
                        10,
                        4,
                    ),
                    price1WeekPrice: this.toDecimalOrNull(
                        price1Week?.price,
                        14,
                        4,
                    ),
                    price1WeekPriceChange: this.toDecimalOrNull(
                        price1Week?.price_change,
                        14,
                        4,
                    ),
                    volume,
                },
            });

            listingsSucceeded++;
            upserted++;

            this.logger.log(
                `Ajaib stock market synced for ${code} (${listing.id})`,
            );
        }

        return {
            listingsProcessed: listings.length,
            listingsSucceeded,
            listingsFailed,
            listingsSkipped,
            upserted,
        };
    }

    private async fetchAjaibStockMarkets(): Promise<AjaibStockMarketApiItem[] | null> {
        const endpoint = this.buildPythonBackendUrl('ajaib-stock-market');

        try {
            const response = await axios.get<AjaibStockMarketApiResponse>(endpoint, {
                timeout: 30000,
            });

            const payload = response.data;

            if (payload?.result?.results && Array.isArray(payload.result.results)) {
                return payload.result.results.filter(
                    (item): item is AjaibStockMarketApiItem => !!item,
                );
            }

            return null;
        } catch (error) {
            const axiosError = error as AxiosError;
            const status = axiosError.response?.status;
            const body =
                typeof axiosError.response?.data === 'string'
                    ? axiosError.response?.data.slice(0, 200)
                    : JSON.stringify(axiosError.response?.data).slice(0, 200);

            this.logger.warn(
                `Failed to fetch Ajaib stock market snapshot list. status=${status ?? 'N/A'} body=${body ?? 'N/A'}`,
            );
            return null;
        }
    }

    private toDecimalOrNull(
        value?: number | string | null,
        precision = 24,
        scale = 2,
    ): Prisma.Decimal | null {
        if (value == null) {
            return null;
        }

        const decimal = new Prisma.Decimal(value);

        if (!decimal.isFinite()) {
            return null;
        }

        const rounded = decimal.toDecimalPlaces(
            scale,
            Prisma.Decimal.ROUND_HALF_UP,
        );
        const fixed = rounded.toFixed(scale);
        const integerDigits = fixed
            .replace(/^-/, '')
            .split('.')[0]
            .replace(/^0+/, '').length;

        if (integerDigits > precision - scale) {
            return null;
        }

        return new Prisma.Decimal(fixed);
    }

    private toBigIntOrNull(
        value?: number | string | null,
    ): bigint | null {
        if (value == null) {
            return null;
        }

        const decimal = new Prisma.Decimal(value);

        if (!decimal.isFinite()) {
            return null;
        }

        return BigInt(decimal.toFixed(0, Prisma.Decimal.ROUND_DOWN));
    }

    private buildPythonBackendUrl(path: string): string {
        return new URL(path, `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`).toString();
    }
}