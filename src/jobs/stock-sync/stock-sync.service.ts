import {
    Injectable,
    Logger,
} from '@nestjs/common';
import {
    AssetType,
    CompanyStatus,
    DividendType,
    ExchangeType,
    ManagementRole,
    ShareholderType,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { RawStockDto } from './dto/raw-stock.dto';
import { IdxStockScraper } from './scrapers/idx-stock.scraper';

@Injectable()
export class StockSyncService {

    private readonly logger =
        new Logger(
            StockSyncService.name,
        );

    constructor(
        private readonly prisma: PrismaService,
        private readonly idxStockScraper: IdxStockScraper,
    ) { }

    async syncIndonesia(): Promise<RawStockDto[]> {
        const allStocks:
            RawStockDto[] = [];
        let page = 1;
        let hasNext = true;
        const pageSize = Number(
            process.env.EMITEN_API_PAGE_SIZE ??
            20,
        );

        while (hasNext) {
            const result =
                await this.idxStockScraper.scrapePage(
                    page,
                    pageSize,
                );

            if (
                result.stocks.length >
                0
            ) {
                await this.persistStocks(
                    result.stocks,
                );
                allStocks.push(
                    ...result.stocks,
                );
            }

            this.logger.log(
                `Page ${page} synced. pageRows=${result.stocks.length} totalSynced=${allStocks.length}`,
            );

            hasNext =
                result.hasNext;
            page++;
        }

        this.logger.log(
            `Scraped and synced ${allStocks.length} IDX stocks`,
        );

        return allStocks;
    }

    private async persistStocks(
        stocks: RawStockDto[],
    ): Promise<void> {
        for (const stock of stocks) {
            const country =
                await this.prisma.country.upsert(
                    {
                        where: {
                            code:
                                stock.countryCode,
                        },
                        update: {},
                        create: {
                            code:
                                stock.countryCode,
                            name: 'Indonesia',
                            currency:
                                'IDR',
                        },
                    },
                );

            const exchange =
                await this.prisma.exchange.upsert(
                    {
                        where: {
                            code:
                                stock.exchangeCode,
                        },
                        update: {
                            countryId:
                                country.id,
                        },
                        create: {
                            code:
                                stock.exchangeCode,
                            name: 'Indonesia Stock Exchange',
                            timezone:
                                'Asia/Jakarta',
                            exchangeType:
                                ExchangeType.STOCK,
                            countryId:
                                country.id,
                        },
                    },
                );

            const sectorName =
                stock.sectorName?.trim() ||
                'Unknown';
            const industryName =
                stock.industryName?.trim() ||
                sectorName;

            const sector =
                await this.prisma.sector.upsert(
                    {
                        where: {
                            name: sectorName,
                        },
                        update: {},
                        create: {
                            name: sectorName,
                        },
                    },
                );

            const existingIndustry =
                await this.prisma.industry.findFirst(
                    {
                        where: {
                            name: industryName,
                            sectorId:
                                sector.id,
                        },
                    },
                );
            const industry =
                existingIndustry ??
                (await this.prisma.industry.create(
                    {
                        data: {
                            name: industryName,
                            sectorId:
                                sector.id,
                        },
                    },
                ));

            const existingListing =
                await this.prisma.listing.findUnique(
                    {
                        where: {
                            symbol_exchangeId: {
                                symbol:
                                    stock.symbol,
                                exchangeId:
                                    exchange.id,
                            },
                        },
                    },
                );

            let companyId =
                existingListing?.companyId;

            if (existingListing) {
                await this.prisma.company.update(
                    {
                        where: {
                            id: existingListing.companyId,
                        },
                        data: {
                            legalName:
                                stock.legalName ??
                                stock.companyName,
                            displayName:
                                stock.displayName ??
                                stock.companyName,
                            description:
                                stock.description,
                            website:
                                stock.website,
                            logoUrl:
                                stock.logoUrl,
                            ceo: stock.ceo,
                            foundedYear:
                                stock.foundedYear,
                            employeeCount:
                                stock.employeeCount,
                            headquarters:
                                stock.headquarters,
                            countryId:
                                country.id,
                            industryId:
                                industry.id,
                            status:
                                CompanyStatus.ACTIVE,
                        },
                    },
                );
            }
            if (!companyId) {
                const company =
                    await this.prisma.company.create(
                        {
                            data: {
                                legalName:
                                    stock.legalName ??
                                    stock.companyName,
                                displayName:
                                    stock.displayName ??
                                    stock.companyName,
                                description:
                                    stock.description,
                                website:
                                    stock.website,
                                logoUrl:
                                    stock.logoUrl,
                                ceo: stock.ceo,
                                foundedYear:
                                    stock.foundedYear,
                                employeeCount:
                                    stock.employeeCount,
                                headquarters:
                                    stock.headquarters,
                                countryId:
                                    country.id,
                                industryId:
                                    industry.id,
                                status:
                                    CompanyStatus.ACTIVE,
                            },
                        },
                    );

                companyId =
                    company.id;

                await this.prisma.listing.create(
                    {
                        data: {
                            symbol:
                                stock.symbol,
                            assetType:
                                AssetType.STOCK,
                            companyId:
                                company.id,
                            exchangeId:
                                exchange.id,
                        },
                    },
                );
            }

            if (!companyId) {
                continue;
            }

            await this.persistDividends(
                companyId,
                stock,
            );
            await this.persistManagement(
                companyId,
                stock,
            );
            await this.persistShareholders(
                companyId,
                stock,
            );
        }
    }

    private async persistDividends(
        companyId: string,
        stock: RawStockDto,
    ): Promise<void> {
        for (const dividend of stock.dividends ?? []) {
            if (
                dividend.dps ==
                null ||
                !dividend.fiscalYear
            ) {
                continue;
            }
            const fiscalYear =
                dividend.fiscalYear;
            await this.prisma.dividend.create(
                {
                    data: {
                        companyId,
                        dividendType:
                            this.mapDividendType(
                                dividend.type,
                            ),
                        fiscalYear,
                        declaredDate:
                            dividend.declaredDate,
                        exDividendDate:
                            dividend.exDividendDate,
                        recordDate:
                            dividend.recordDate,
                        paymentDate:
                            dividend.paymentDate,
                        dps: dividend.dps,
                        currency:
                            dividend.currency ??
                            'IDR',
                    },
                },
            );
        }
    }

    private async persistManagement(
        companyId: string,
        stock: RawStockDto,
    ): Promise<void> {
        const members =
            stock.managementMembers ??
            [];
        if (members.length === 0) {
            return;
        }

        for (const member of members) {
            const name =
                member.name.trim();
            const position =
                member.position.trim();
            if (!name || !position) {
                continue;
            }

            const existing =
                await this.prisma.management.findFirst(
                    {
                        where: {
                            companyId,
                            name,
                            position,
                            isActive: true,
                        },
                    },
                );

            if (existing) {
                continue;
            }

            await this.prisma.management.create(
                {
                    data: {
                        companyId,
                        name,
                        position,
                        role: this.mapManagementRole(
                            member.group,
                            member.position,
                        ),
                        isActive: true,
                    },
                },
            );
        }
    }

    private async persistShareholders(
        companyId: string,
        stock: RawStockDto,
    ): Promise<void> {
        const shareholders =
            stock.shareholders ??
            [];
        if (
            shareholders.length === 0
        ) {
            return;
        }

        const snapshotDate =
            new Date();
        snapshotDate.setHours(
            0,
            0,
            0,
            0,
        );

        for (const shareholder of shareholders) {
            if (
                !shareholder.name ||
                shareholder.sharesHeld ==
                null ||
                shareholder.percentageOwned ==
                null
            ) {
                continue;
            }

            await this.prisma.shareholding.upsert(
                {
                    where: {
                        companyId_shareholderName_date:
                        {
                            companyId,
                            shareholderName:
                                shareholder.name,
                            date: snapshotDate,
                        },
                    },
                    update: {
                        shareholderType:
                            this.mapShareholderType(
                                shareholder.category,
                            ),
                        sharesHeld:
                            Math.trunc(
                                shareholder.sharesHeld,
                            ),
                        percentageOwned:
                            shareholder.percentageOwned,
                        currency:
                            'IDR',
                    },
                    create: {
                        companyId,
                        date: snapshotDate,
                        shareholderName:
                            shareholder.name,
                        shareholderType:
                            this.mapShareholderType(
                                shareholder.category,
                            ),
                        sharesHeld:
                            Math.trunc(
                                shareholder.sharesHeld,
                            ),
                        percentageOwned:
                            shareholder.percentageOwned,
                        currency:
                            'IDR',
                    },
                },
            );
        }
    }

    private mapDividendType(
        type?: string,
    ): DividendType {
        const normalized =
            type
                ?.trim()
                .toUpperCase();
        if (
            normalized === 'STOCK'
        ) {
            return DividendType.STOCK;
        }
        if (
            normalized ===
            'INTERIM'
        ) {
            return DividendType.INTERIM;
        }
        if (
            normalized ===
            'SPECIAL'
        ) {
            return DividendType.SPECIAL;
        }

        return DividendType.FINAL;
    }

    private mapManagementRole(
        group:
            | 'DIRECTOR'
            | 'COMMISSIONER',
        position: string,
    ): ManagementRole {
        const normalized =
            position.toUpperCase();
        if (
            normalized.includes(
                'PRESIDEN DIREKTUR',
            )
        ) {
            return ManagementRole.PRESIDENT_DIRECTOR;
        }
        if (
            normalized.includes(
                'PRESIDEN KOMISARIS',
            )
        ) {
            return ManagementRole.PRESIDENT_COMMISSIONER;
        }
        if (
            normalized.includes(
                'INDEPENDEN',
            )
        ) {
            return ManagementRole.INDEPENDENT_COMMISSIONER;
        }

        return group ===
            'DIRECTOR'
            ? ManagementRole.DIRECTOR
            : ManagementRole.COMMISSIONER;
    }

    private mapShareholderType(
        category?: string,
    ): ShareholderType {
        const normalized =
            category
                ?.trim()
                .toUpperCase() ?? '';
        if (
            normalized.includes(
                'DIREKSI',
            ) ||
            normalized.includes(
                'KOMISARIS',
            )
        ) {
            return ShareholderType.INSIDER;
        }
        if (
            normalized.includes(
                'LEBIH DARI 5%',
            ) ||
            normalized.includes(
                'PENGENDALI',
            )
        ) {
            return ShareholderType.PROMOTER;
        }
        if (
            normalized.includes(
                'MASYARAKAT',
            )
        ) {
            return ShareholderType.PUBLIC;
        }
        if (
            normalized.includes(
                'TREASURY',
            )
        ) {
            return ShareholderType.INSTITUTIONAL;
        }

        return ShareholderType.INSTITUTIONAL;
    }

}
