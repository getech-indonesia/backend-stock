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
        [key: string]: unknown;
        Jenis?: string;
        TahunBuku?: string;
        TanggalCum?: string;
        TanggalDPS?: string;
        TanggalPembayaran?: string;
        CashDividenPerSaham?: number;
        CashDividenPerSahamMU?: string;
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
                                        this.extractCashDividendTotal(
                                            dividend,
                                        ),
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

    private extractCashDividendTotal(
        dividend: Record<string, unknown>,
    ): number | undefined {
        const directCandidates = [
            'CashDividendTotal',
            'CashDividenTotal',
            'TotalCashDividend',
            'TotalCashDividen',
            'CashDividendAmount',
            'DividendAmount',
        ];

        for (const key of directCandidates) {
            const value =
                dividend[key];
            const parsed =
                this.parseLooseNumber(
                    value,
                );
            if (parsed != null) {
                return parsed;
            }
        }

        const keywordPatterns = [
            'cash dividend',
            'cash dividends',
            'dividend',
            'dividends',
            'distribution of cash dividends',
            'distribution of cash dividend',
            'cash dividend distribution',
            'cash dividend distributed',
            'total cash dividend',
            'cash dividend amount',
            'distributions of cash dividends',
        ];

        for (const [rawKey, rawValue] of Object.entries(dividend)) {
            const normalizedKey =
                rawKey
                    .toLowerCase()
                    .replace(/[_-]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

            const match =
                keywordPatterns.some(
                    (
                        keyword,
                    ) =>
                        normalizedKey.includes(
                            keyword,
                        ),
                );

            if (!match) {
                continue;
            }

            const parsed =
                this.parseLooseNumber(
                    rawValue,
                );
            if (parsed != null) {
                return parsed;
            }
        }

        return undefined;
    }

    private parseLooseNumber(
        value: unknown,
    ): number | undefined {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value !== 'string') {
            return undefined;
        }

        const trimmed =
            value.trim();
        if (!trimmed) {
            return undefined;
        }

        const isNegative =
            trimmed.startsWith('(') &&
            trimmed.endsWith(')');
        const numericPart =
            trimmed
                .replace(/[()]/g, '')
                .replace(/[^0-9,.-]/g, '');

        if (!numericPart) {
            return undefined;
        }

        const normalized =
            numericPart.includes(',') && !numericPart.includes('.')
                ? numericPart.replace(/,/g, '')
                : numericPart.replace(/,/g, '');
        const parsed =
            Number.parseFloat(
                normalized,
            );

        if (!Number.isFinite(parsed)) {
            return undefined;
        }

        return isNegative
            ? -parsed
            : parsed;
    }

}
