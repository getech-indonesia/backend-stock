import {
    Injectable,
    Logger,
} from '@nestjs/common';

import axios, { AxiosError } from 'axios';

import { PrismaService } from '../../../prisma/prisma.service';

type StockPriceApiReply = {
    Date?: string;
    OpenPrice?: number;
    High?: number;
    Low?: number;
    Close?: number;
    Volume?: number;
    Value?: number | null;
};

type StockPriceApiResponse = {
    KodeEmiten?: string;
    replies?: Array<StockPriceApiReply | null>;
};

type NormalizedStockPriceRow = {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    adjClose: number | null;
    volume: bigint;
    value: number | null;
};

@Injectable()
export class StockPriceSyncService {

    private readonly logger =
        new Logger(
            StockPriceSyncService.name,
        );

    private readonly pythonBackendBaseUrl =
        process.env.PYTHON_BACKEND_BASE_URL ??
        'http://127.0.0.1:5000/api';

    private readonly concurrency =
        this.parsePositiveInteger(
            process.env.STOCK_PRICE_SYNC_CONCURRENCY,
            5,
        );

    private readonly refreshWindowDays =
        this.parsePositiveInteger(
            process.env.STOCK_PRICE_SYNC_REFRESH_DAYS,
            3,
        );

    private readonly retryCount =
        this.parsePositiveInteger(
            process.env.STOCK_PRICE_SYNC_RETRY_COUNT,
            3,
        );

    private readonly retryDelayMs =
        this.parsePositiveInteger(
            process.env.STOCK_PRICE_SYNC_RETRY_DELAY_MS,
            1000,
        );

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async syncAllFromPython(): Promise<{
        listingsProcessed: number;
        listingsFailed: number;
        rowsInserted: number;
        rowsUpdated: number;
        rowsSkipped: number;
    }> {
        const listings =
            await this.prisma.listing.findMany(
                {
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
                },
            );

        const filteredSymbols =
            this.parseSymbolFilter(
                process.env.STOCK_PRICE_SYNC_SYMBOLS,
            );
        const targetListings =
            filteredSymbols.length > 0
                ? listings.filter(
                    (
                        listing,
                    ) =>
                        filteredSymbols.includes(
                            listing.symbol.toUpperCase(),
                        ),
                )
                : listings;

        const latestDates =
            await this.prisma.stockPrice.groupBy(
                {
                    by: ['listingId'],
                    _max: {
                        date: true,
                    },
                },
            );

        const latestDateByListingId =
            new Map(
                latestDates.map(
                    (
                        row,
                    ) => [
                        row.listingId,
                        row._max.date,
                    ],
                ),
            );

        let listingsProcessed = 0;
        let listingsFailed = 0;
        let rowsInserted = 0;
        let rowsUpdated = 0;
        let rowsSkipped = 0;

        await this.runWithConcurrency(
            targetListings,
            this.concurrency,
            async (
                listing,
            ) => {
                try {
                    const result =
                        await this.syncListing(
                            listing.id,
                            listing.symbol,
                            latestDateByListingId.get(
                                listing.id,
                            ) ?? null,
                        );

                    listingsProcessed++;
                    rowsInserted +=
                        result.rowsInserted;
                    rowsUpdated +=
                        result.rowsUpdated;
                    rowsSkipped +=
                        result.rowsSkipped;
                } catch (error) {
                    listingsFailed++;
                    this.logger.error(
                        `Stock price sync failed for ${listing.symbol} (${listing.id}): ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    );
                }
            },
        );

        this.logger.log(
            `Stock price sync complete. listingsProcessed=${listingsProcessed} listingsFailed=${listingsFailed} rowsInserted=${rowsInserted} rowsUpdated=${rowsUpdated} rowsSkipped=${rowsSkipped}`,
        );

        return {
            listingsProcessed,
            listingsFailed,
            rowsInserted,
            rowsUpdated,
            rowsSkipped,
        };
    }

    async syncAllPricesWithUpsert(listingId?: string): Promise<{
        listingsProcessed: number;
        listingsFailed: number;
        upsertedCount: number;
        failedCount: number;
    }> {
        let targetListings: { id: string; symbol: string }[] = [];

        if (listingId) {
            const listing = await this.prisma.listing.findUnique({
                where: { id: listingId },
                select: { id: true, symbol: true },
            });
            if (!listing) {
                throw new Error(`Listing with ID ${listingId} not found`);
            }
            targetListings = [listing];
        } else {
            targetListings = await this.prisma.listing.findMany({
                select: { id: true, symbol: true },
                orderBy: { symbol: 'asc' },
            });
        }

        let listingsProcessed = 0;
        let listingsFailed = 0;
        let upsertedCount = 0;
        let failedCount = 0;

        await this.runWithConcurrency(
            targetListings,
            this.concurrency,
            async (listing) => {
                try {
                    const result = await this.syncListingWithFullUpsert(
                        listing.id,
                        listing.symbol,
                    );
                    if (result.upserted > 0) {
                        listingsProcessed++;
                        upsertedCount += result.upserted;
                        failedCount += result.failed;
                    } else if (result.failed > 0) {
                        listingsFailed++;
                        failedCount += result.failed;
                    } else {
                        listingsProcessed++;
                    }
                } catch (error) {
                    listingsFailed++;
                    this.logger.error(
                        `Full stock price sync failed for ${listing.symbol} (${listing.id}): ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    );
                }
            },
        );

        return {
            listingsProcessed,
            listingsFailed,
            upsertedCount,
            failedCount,
        };
    }

    async syncListingWithFullUpsert(
        listingId: string,
        symbol: string,
    ): Promise<{
        upserted: number;
        failed: number;
    }> {
        const rows = await this.fetchStockPrices(symbol);

        if (rows.length === 0) {
            this.logger.warn(
                `Skipping ${symbol} because Python backend returned no stock price rows`,
            );
            return { upserted: 0, failed: 0 };
        }

        let upserted = 0;
        let failed = 0;
        const batchSize = 100;

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            try {
                await this.prisma.$transaction(
                    batch.map((row) =>
                        this.prisma.stockPrice.upsert({
                            where: {
                                listingId_date: {
                                    listingId,
                                    date: row.date,
                                },
                            },
                            update: {
                                open: row.open,
                                high: row.high,
                                low: row.low,
                                close: row.close,
                                adjClose: row.adjClose,
                                volume: row.volume,
                                value: row.value,
                            },
                            create: {
                                listingId,
                                date: row.date,
                                open: row.open,
                                high: row.high,
                                low: row.low,
                                close: row.close,
                                adjClose: row.adjClose,
                                volume: row.volume,
                                value: row.value,
                            },
                        })
                    )
                );
                upserted += batch.length;
            } catch (error) {
                this.logger.error(
                    `Failed to upsert stock price batch for ${symbol}: ${error instanceof Error ? error.message : String(error)}`
                );
                failed += batch.length;
            }
        }

        this.logger.log(
            `Stock prices full upsert complete for ${symbol}. upserted=${upserted} failed=${failed}`,
        );

        return { upserted, failed };
    }

    private async syncListing(
        listingId: string,
        symbol: string,
        latestStoredDate: Date | null,
    ): Promise<{
        rowsInserted: number;
        rowsUpdated: number;
        rowsSkipped: number;
    }> {
        const rows =
            await this.fetchStockPrices(
                symbol,
            );

        if (rows.length === 0) {
            this.logger.warn(
                `Skipping ${symbol} because Python backend returned no stock price rows`,
            );
            return {
                rowsInserted: 0,
                rowsUpdated: 0,
                rowsSkipped: 0,
            };
        }

        const refreshCutoff =
            latestStoredDate
                ? this.subtractDaysUtc(
                    latestStoredDate,
                    this.refreshWindowDays - 1,
                )
                : null;

        const rowsToInsert:
            NormalizedStockPriceRow[] = [];
        const rowsToRefresh:
            NormalizedStockPriceRow[] = [];
        let rowsSkipped = 0;

        for (const row of rows) {
            if (!latestStoredDate) {
                rowsToInsert.push(
                    row,
                );
                continue;
            }

            if (
                row.date >
                latestStoredDate
            ) {
                rowsToInsert.push(
                    row,
                );
                continue;
            }

            if (
                refreshCutoff &&
                row.date >=
                    refreshCutoff
            ) {
                rowsToRefresh.push(
                    row,
                );
                continue;
            }

            rowsSkipped++;
        }

        if (rowsToInsert.length > 0) {
            await this.prisma.stockPrice.createMany(
                {
                    data: rowsToInsert.map(
                        (
                            row,
                        ) => ({
                            listingId,
                            date: row.date,
                            open: row.open,
                            high: row.high,
                            low: row.low,
                            close: row.close,
                            adjClose:
                                row.adjClose,
                            volume:
                                row.volume,
                            value:
                                row.value,
                        }),
                    ),
                    skipDuplicates: true,
                },
            );
        }

        if (rowsToRefresh.length > 0) {
            await this.prisma.$transaction(
                rowsToRefresh.map(
                    (
                        row,
                    ) =>
                        this.prisma.stockPrice.upsert(
                            {
                                where: {
                                    listingId_date: {
                                        listingId,
                                        date: row.date,
                                    },
                                },
                                update: {
                                    open: row.open,
                                    high: row.high,
                                    low: row.low,
                                    close: row.close,
                                    adjClose:
                                        row.adjClose,
                                    volume:
                                        row.volume,
                                    value:
                                        row.value,
                                },
                                create: {
                                    listingId,
                                    date: row.date,
                                    open: row.open,
                                    high: row.high,
                                    low: row.low,
                                    close: row.close,
                                    adjClose:
                                        row.adjClose,
                                    volume:
                                        row.volume,
                                    value:
                                        row.value,
                                },
                            },
                        ),
                ),
            );
        }

        this.logger.log(
            `Stock prices synced for ${symbol}. inserted=${rowsToInsert.length} refreshed=${rowsToRefresh.length} skipped=${rowsSkipped}`,
        );

        return {
            rowsInserted:
                rowsToInsert.length,
            rowsUpdated:
                rowsToRefresh.length,
            rowsSkipped,
        };
    }

    private async fetchStockPrices(
        symbol: string,
    ): Promise<
        NormalizedStockPriceRow[]
    > {
        const endpoint =
            this.buildPythonBackendUrl(
                'stock-price',
            );

        try {
            const response =
                await this.getWithRetry<
                    StockPriceApiResponse
                >(
                    endpoint,
                    {
                        symbol,
                    },
                );

            return (
                response.data?.replies ??
                []
            ).flatMap(
                (
                    row,
                ) => {
                    const normalized =
                        this.normalizeReply(
                            row,
                            symbol,
                        );

                    return normalized
                        ? [normalized]
                        : [];
                },
            );
        } catch (error) {
            const axiosError =
                error as AxiosError;
            const status =
                axiosError.response
                    ?.status;
            const body =
                typeof axiosError
                    .response
                    ?.data ===
                    'string'
                    ? axiosError
                        .response
                        ?.data
                        .slice(
                            0,
                            200,
                        )
                    : JSON.stringify(
                        axiosError
                            .response
                            ?.data,
                    ).slice(
                        0,
                        200,
                    );

            throw new Error(
                `Failed to fetch stock prices for ${symbol}. status=${status ?? 'N/A'} body=${body ?? 'N/A'}`,
            );
        }
    }

    private async getWithRetry<T>(
        endpoint: string,
        params: Record<
            string,
            string
        >,
    ): Promise<{
        data: T;
    }> {
        let attempt = 0;

        while (true) {
            try {
                return await axios.get<T>(
                    endpoint,
                    {
                        params,
                        timeout: 30000,
                    },
                );
            } catch (error) {
                attempt++;

                const axiosError =
                    error as AxiosError;
                const status =
                    axiosError.response
                        ?.status;
                const shouldRetry =
                    attempt <
                    this.retryCount &&
                    (
                        status == null ||
                        status >= 500
                    );

                if (
                    !shouldRetry
                ) {
                    throw error;
                }

                this.logger.warn(
                    `Retrying stock price fetch for ${params.symbol}. attempt=${attempt + 1}/${this.retryCount} status=${status ?? 'N/A'}`,
                );
                await this.sleep(
                    this.retryDelayMs,
                );
            }
        }
    }

    private normalizeReply(
        row:
            | StockPriceApiReply
            | null
            | undefined,
        symbol: string,
    ): NormalizedStockPriceRow | null {
        if (!row) {
            return null;
        }

        const date =
            this.parseTradingDate(
                row.Date,
            );
        if (!date) {
            this.logger.warn(
                `Skipping stock price row for ${symbol} because date is invalid: ${row.Date ?? 'N/A'}`,
            );
            return null;
        }

        if (
            row.OpenPrice == null ||
            row.High == null ||
            row.Low == null ||
            row.Close == null ||
            row.Volume == null
        ) {
            this.logger.warn(
                `Skipping stock price row for ${symbol} on ${row.Date} because required OHLCV fields are missing`,
            );
            return null;
        }

        return {
            date,
            open: row.OpenPrice,
            high: row.High,
            low: row.Low,
            close: row.Close,
            adjClose: null,
            volume: BigInt(
                Math.trunc(
                    row.Volume,
                ),
            ),
            value:
                row.Value == null
                    ? null
                    : row.Value,
        };
    }

    private parseTradingDate(
        value?: string,
    ): Date | null {
        if (!value) {
            return null;
        }

        const normalized =
            value.slice(
                0,
                10,
            );
        const parsed =
            new Date(
                `${normalized}T00:00:00.000Z`,
            );

        if (
            Number.isNaN(
                parsed.getTime(),
            )
        ) {
            return null;
        }

        return parsed;
    }

    private subtractDaysUtc(
        date: Date,
        days: number,
    ): Date {
        const result =
            new Date(
                date.getTime(),
            );
        result.setUTCDate(
            result.getUTCDate() -
                days,
        );
        return result;
    }

    private buildPythonBackendUrl(
        path: string,
    ): string {
        return new URL(
            path,
            `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`,
        ).toString();
    }

    private parsePositiveInteger(
        value:
            | string
            | undefined,
        fallback: number,
    ): number {
        const parsed =
            Number.parseInt(
                value ?? '',
                10,
            );

        if (
            Number.isNaN(
                parsed,
            ) ||
            parsed <= 0
        ) {
            return fallback;
        }

        return parsed;
    }

    private parseSymbolFilter(
        value:
            | string
            | undefined,
    ): string[] {
        if (!value) {
            return [];
        }

        return value
            .split(
                ',',
            )
            .map(
                (
                    symbol,
                ) =>
                    symbol
                        .trim()
                        .toUpperCase(),
            )
            .filter(Boolean);
    }

    private sleep(
        ms: number,
    ): Promise<void> {
        return new Promise(
            (
                resolve,
            ) => {
                setTimeout(
                    resolve,
                    ms,
                );
            },
        );
    }

    private async runWithConcurrency<T>(
        items: T[],
        concurrency: number,
        worker: (
            item: T,
        ) => Promise<void>,
    ): Promise<void> {
        let currentIndex = 0;

        const runners =
            Array.from(
                {
                    length: Math.min(
                        concurrency,
                        items.length,
                    ),
                },
                async () => {
                    while (
                        currentIndex <
                        items.length
                    ) {
                        const item =
                            items[
                                currentIndex
                            ];
                        currentIndex++;
                        await worker(
                            item,
                        );
                    }
                },
            );

        await Promise.all(
            runners,
        );
    }

}
