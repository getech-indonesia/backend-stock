import {
    Injectable,
    Logger,
} from '@nestjs/common';
import {
    AssetType,
    CompanyStatus,
    ExchangeType,
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

                continue;
            }

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
    }

}
