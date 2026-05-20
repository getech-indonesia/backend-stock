import {
    Injectable,
    Logger,
} from '@nestjs/common';

import axios, { AxiosError } from 'axios';

import { PrismaService } from '../../../prisma/prisma.service';


type SharesDataApiResponse = {
    date?: string;
    sharesOutstanding?: number;
    sharesFloat?: number | null;
    sharesInstitutional?: number | null;
    sharesInsider?: number | null;
};

type SharesDataEnvelopeApiResponse = {
    count?: number;
    shares_data?: SharesDataApiResponse[];
};

@Injectable()
export class SharesDataSyncService {

    private readonly logger =
        new Logger(
            SharesDataSyncService.name,
        );

    private readonly pythonBackendBaseUrl =
        process.env.PYTHON_BACKEND_BASE_URL ??
        'http://127.0.0.1:5000/api';

    async syncAllFromPython(): Promise<{
        companiesProcessed: number;
        recordsUpserted: number;
        skipped: number;
    }> {
        const companies =
            await this.prisma.company.findMany(
                {
                    select: {
                        id: true,
                        listings: {
                            select: {
                                symbol: true,
                            },
                            orderBy: {
                                createdAt: 'asc',
                            },
                            take: 1,
                        },
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            );

        let recordsUpserted = 0;
        let skipped = 0;

        for (const company of companies) {
            const symbol =
                company.listings[0]
                    ?.symbol;

            if (!symbol) {
                skipped++;
                this.logger.warn(
                    `Skipping company ${company.id} because it has no listing symbol`,
                );
                continue;
            }

            const payloads =
                await this.fetchSharesData(
                    symbol,
                );

            if (!payloads) {
                skipped++;
                continue;
            }

            let companyRecordsUpserted = 0;

            for (const payload of payloads) {
                const snapshotDate =
                    this.parseSnapshotDate(
                        payload.date,
                    );
                if (!snapshotDate) {
                    skipped++;
                    this.logger.warn(
                        `Skipping symbol ${symbol} because date is invalid: ${payload.date ?? 'N/A'}`,
                    );
                    continue;
                }

                if (
                    payload.sharesOutstanding ==
                    null
                ) {
                    skipped++;
                    this.logger.warn(
                        `Skipping symbol ${symbol} on ${payload.date} because sharesOutstanding is missing`,
                    );
                    continue;
                }

                await this.prisma.sharesData.upsert(
                    {
                        where: {
                            companyId_date: {
                                companyId:
                                    company.id,
                                date: snapshotDate,
                            },
                        },
                        update: {
                            sharesOutstanding:
                                Math.trunc(
                                    payload.sharesOutstanding,
                                ),
                            sharesFloat:
                                payload.sharesFloat ==
                                null
                                    ? null
                                    : Math.trunc(
                                        payload.sharesFloat,
                                    ),
                            sharesInstitutional:
                                payload.sharesInstitutional ==
                                null
                                    ? null
                                    : Math.trunc(
                                        payload.sharesInstitutional,
                                    ),
                            sharesInsider:
                                payload.sharesInsider ==
                                null
                                    ? null
                                    : Math.trunc(
                                        payload.sharesInsider,
                                    ),
                        },
                        create: {
                            companyId:
                                company.id,
                            date: snapshotDate,
                            sharesOutstanding:
                                Math.trunc(
                                    payload.sharesOutstanding,
                                ),
                            sharesFloat:
                                payload.sharesFloat ==
                                null
                                    ? null
                                    : Math.trunc(
                                        payload.sharesFloat,
                                    ),
                            sharesInstitutional:
                                payload.sharesInstitutional ==
                                null
                                    ? null
                                    : Math.trunc(
                                        payload.sharesInstitutional,
                                    ),
                            sharesInsider:
                                payload.sharesInsider ==
                                null
                                    ? null
                                    : Math.trunc(
                                        payload.sharesInsider,
                                    ),
                            marketCap: 0,
                            currency: 'IDR',
                        },
                    },
                );

                recordsUpserted++;
                companyRecordsUpserted++;
            }

            this.logger.log(
                `Shares data synced for ${symbol} (${company.id}) with ${companyRecordsUpserted} record(s)`,
            );
        }

        return {
            companiesProcessed:
                companies.length,
            recordsUpserted,
            skipped,
        };
    }

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private async fetchSharesData(
        symbol: string,
    ): Promise<
        SharesDataApiResponse[] | null
    > {
        const endpoint =
            this.buildPythonBackendUrl(
                'shares-data',
            );

        try {
            const response =
                await axios.get<
                    | SharesDataApiResponse
                    | SharesDataEnvelopeApiResponse
                >(
                    endpoint,
                    {
                        params: {
                            symbol,
                        },
                        timeout: 30000,
                    },
                );

            const payload =
                response.data;

            if (
                Array.isArray(
                    (
                        payload as SharesDataEnvelopeApiResponse
                    ).shares_data,
                )
            ) {
                return (
                    payload as SharesDataEnvelopeApiResponse
                ).shares_data!.filter(
                    (
                        item,
                    ) => !!item,
                );
            }

            if (
                payload &&
                typeof payload ===
                    'object' &&
                'date' in payload
            ) {
                return [
                    payload as SharesDataApiResponse,
                ];
            }

            this.logger.warn(
                `Failed to parse shares data for ${symbol}. body=${JSON.stringify(payload).slice(0, 200)}`,
            );
            return null;
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

            this.logger.warn(
                `Failed to fetch shares data for ${symbol}. status=${status ?? 'N/A'} body=${body ?? 'N/A'}`,
            );
            return null;
        }
    }

    private parseSnapshotDate(
        value?: string,
    ): Date | null {
        if (!value) {
            return null;
        }

        const parsed =
            new Date(value);
        if (
            Number.isNaN(
                parsed.getTime(),
            )
        ) {
            return null;
        }

        parsed.setHours(
            0,
            0,
            0,
            0,
        );
        return parsed;
    }

    private buildPythonBackendUrl(
        path: string,
    ): string {
        return new URL(
            path,
            `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`,
        ).toString();
    }

}
