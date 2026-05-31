import {
    Injectable,
    Logger,
} from '@nestjs/common';

import axios, { AxiosError } from 'axios';

import { RawStockDto } from '../dto/raw-stock.dto';

type EmitenApiItem = {
    listing?: {
        symbol?: string;
    };
    market?: {
        icon_url?: string;
        name?: string;
    };
    management?: {
        directors?: Array<{
            Nama?: string;
            Jabatan?: string;
        }>;
        commissioners?: Array<{
            Nama?: string;
            Jabatan?: string;
        }>;
    };
    dividends?: Array<{
        Jenis?: string;
        TahunBuku?: string;
        TanggalCum?: string;
        TanggalDPS?: string;
        TanggalPembayaran?: string;
        CashDividenPerSaham?: number;
        CashDividenPerSahamMU?: string;
        CashDividendTotal?: number;
        CashDividenTotal?: number;
    }>;
    shareholders?: Array<{
        Nama?: string;
        Kategori?: string;
        Jumlah?: number;
        Persentase?: number;
    }>;
    company?: {
        legalName?: string;
        displayName?: string;
        description?: string;
        website?: string;
        logoUrl?: string;
        ceo?: string;
        foundedYear?: number;
        employeeCount?: number;
        headquarters?: string;
    };
    country?: {
        code?: string;
    };
    sector?: {
        name?: string;
    };
    industry?: {
        name?: string;
    };
};

type EmitenApiResponse = {
    items?: EmitenApiItem[];
    status?: string;
    pagination?: {
        count?: number;
        next?: string | null;
        page?: number;
        page_size?: number;
    };
};

@Injectable()
export class IdxStockScraper {

    private readonly logger =
        new Logger(
            IdxStockScraper.name,
        );

    private readonly pythonBackendBaseUrl =
        process.env.PYTHON_BACKEND_BASE_URL ??
        'http://127.0.0.1:5000/api';

    async scrapePage(
        page: number,
        pageSize = 20,
    ): Promise<{
        stocks: RawStockDto[];
        hasNext: boolean;
        page: number;
        totalCount?: number;
    }> {
        this.logger.log(
            `Fetching emiten page ${page} from Python backend`,
        );

        let response:
            Awaited<
                ReturnType<
                    typeof axios.get<EmitenApiResponse>
                >
            >;
        try {
            const endpoint =
                this.buildPythonBackendUrl(
                    'emiten',
                );

            response =
                await axios.get<
                    EmitenApiResponse
                >(
                    endpoint,
                    {
                        params: {
                            page,
                            page_size:
                                pageSize,
                        },
                        timeout: 30000,
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

            this.logger.error(
                `Emiten API request failed on page ${page}. status=${status ?? 'N/A'} body=${body ?? 'N/A'}`,
            );
            throw error;
        }

        const rows =
            response.data?.items ??
            [];
        const pagination =
            response.data?.pagination;

        this.logger.log(
            `Emiten API page ${page} fetched: ${rows.length} stocks`,
        );

        const stocks =
            rows.map(
                (
                    row,
                ): RawStockDto => {
                    const directors =
                        row.management
                            ?.directors ??
                        [];
                    const commissioners =
                        row.management
                            ?.commissioners ??
                        [];
                    const ceoFromDirectors =
                        directors.find(
                            (
                                director,
                            ) =>
                                (
                                    director.Jabatan ??
                                    ''
                                )
                                    .toUpperCase()
                                    .includes(
                                        'PRESIDEN DIREKTUR',
                                    ),
                        )?.Nama ??
                        directors[0]
                            ?.Nama;

                    return {
                        symbol:
                            row.listing
                                ?.symbol ??
                            '',
                        companyName:
                            row.company
                                ?.displayName ??
                            row.company
                                ?.legalName ??
                            row.market
                                ?.name ??
                            row.listing
                                ?.symbol ??
                            '',
                        legalName:
                            row.company
                                ?.legalName,
                        displayName:
                            row.company
                                ?.displayName ??
                            row.market
                                ?.name,
                        exchangeCode:
                            'IDX',
                        countryCode:
                            row.country
                                ?.code ??
                            'ID',
                        sectorName:
                            row.sector
                                ?.name,
                        industryName:
                            row.industry
                                ?.name,
                        website:
                            this.normalizeWebsite(
                                row.company
                                    ?.website,
                            ),
                        description:
                            row.company
                                ?.description,
                        logoUrl:
                            row.market
                                ?.icon_url ??
                            row.company
                                ?.logoUrl,
                        ceo:
                            row.company
                                ?.ceo ??
                            ceoFromDirectors,
                        foundedYear:
                            row.company
                                ?.foundedYear,
                        employeeCount:
                            row.company
                                ?.employeeCount,
                        headquarters:
                            row.company
                                ?.headquarters,
                        dividends:
                            row.dividends?.map(
                                (
                                    dividend,
                                ) => ({
                                    type: dividend.Jenis,
                                    fiscalYear:
                                        Number.parseInt(
                                            dividend.TahunBuku ??
                                            '',
                                            10,
                                        ),
                                    declaredDate:
                                        this.parseDate(
                                            dividend.TanggalDPS,
                                        ),
                                    exDividendDate:
                                        this.parseDate(
                                            dividend.TanggalCum,
                                        ),
                                    paymentDate:
                                        this.parseDate(
                                            dividend.TanggalPembayaran,
                                        ),
                                    dps:
                                        dividend.CashDividenPerSaham,
                                    cashDividendTotal:
                                        dividend.CashDividendTotal ??
                                        dividend.CashDividenTotal,
                                    currency:
                                        dividend.CashDividenPerSahamMU ??
                                        'IDR',
                                }),
                            ) ?? [],
                        managementMembers: [
                            ...directors.map(
                                (
                                    member,
                                ) => ({
                                    name:
                                        member.Nama ??
                                        '',
                                    position:
                                        member.Jabatan ??
                                        '',
                                    group:
                                        'DIRECTOR' as const,
                                }),
                            ),
                            ...commissioners.map(
                                (
                                    member,
                                ) => ({
                                    name:
                                        member.Nama ??
                                        '',
                                    position:
                                        member.Jabatan ??
                                        '',
                                    group:
                                        'COMMISSIONER' as const,
                                }),
                            ),
                        ].filter(
                            (
                                member,
                            ) =>
                                Boolean(
                                    member.name,
                                ),
                        ),
                        shareholders:
                            row.shareholders?.map(
                                (
                                    shareholder,
                                ) => ({
                                    name:
                                        shareholder.Nama ??
                                        '',
                                    category:
                                        shareholder.Kategori,
                                    sharesHeld:
                                        shareholder.Jumlah,
                                    percentageOwned:
                                        shareholder.Persentase,
                                }),
                            ).filter(
                                (
                                    shareholder,
                                ) =>
                                    Boolean(
                                        shareholder.name,
                                    ),
                            ) ?? [],
                    };
                },
            );

        return {
            stocks:
                stocks.filter(
                    (
                        stock,
                    ) =>
                        Boolean(
                            stock.symbol,
                        ),
                ),
            hasNext:
                Boolean(
                    pagination?.next,
                ),
            page:
                pagination?.page ??
                page,
            totalCount:
                pagination?.count,
        };
    }

    private normalizeWebsite(
        website?: string,
    ): string | undefined {

        if (!website) {
            return undefined;
        }

        if (
            website.startsWith(
                'http://',
            ) ||
            website.startsWith(
                'https://',
            )
        ) {
            return website;
        }

        return `https://${website}`;
    }

    private buildPythonBackendUrl(
        path: string,
    ): string {
        return new URL(
            path,
            `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`,
        ).toString();
    }

    private parseDate(
        value?: string,
    ): Date | undefined {
        if (!value) {
            return undefined;
        }

        const parsedDate =
            new Date(value);
        if (
            Number.isNaN(
                parsedDate.getTime(),
            )
        ) {
            return undefined;
        }

        return parsedDate;
    }

}
