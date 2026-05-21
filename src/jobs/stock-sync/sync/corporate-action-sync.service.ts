import { Injectable, Logger } from '@nestjs/common';
import { CorporateActionType } from '@prisma/client';

import axios, { AxiosError } from 'axios';

import { PrismaService } from '../../../prisma/prisma.service';

type CorporateActionApiItem = {
  id?: number;
  JenisTindakan?: string;
  JumlahSaham?: number;
  JumlahSahamSetelahTindakan?: number;
  KodeEmiten?: string;
  TanggalPencatatan?: string;
};

type CorporateActionApiResponse = {
  data?: CorporateActionApiItem[];
};

type NormalizedCorporateAction = {
  sourceId: number | null;
  symbol: string;
  actionType: CorporateActionType;
  rawActionType: string;
  effectiveDate: Date;
  sharesOffered: bigint | null;
  sharesAfterAction: bigint | null;
};

@Injectable()
export class CorporateActionSyncService {
  private readonly logger = new Logger(CorporateActionSyncService.name);

  private readonly pythonBackendBaseUrl =
    process.env.PYTHON_BACKEND_BASE_URL ?? 'http://127.0.0.1:5000/api';

  constructor(private readonly prisma: PrismaService) {}

  async syncAllFromPython(): Promise<{
    rowsFetched: number;
    rowsInserted: number;
    rowsUpdated: number;
    rowsSkipped: number;
    unmatchedSymbols: number;
  }> {
    const rows = await this.fetchCorporateActions();

    const listings = await this.prisma.listing.findMany({
      where: {
        exchange: {
          code: 'IDX',
        },
      },
      select: {
        symbol: true,
        companyId: true,
      },
    });

    const companyIdBySymbol = new Map(
      listings.map((listing) => [
        listing.symbol.toUpperCase(),
        listing.companyId,
      ]),
    );

    let rowsInserted = 0;
    let rowsUpdated = 0;
    let rowsSkipped = 0;
    let unmatchedSymbols = 0;

    for (const row of rows) {
      const normalized = this.normalizeRow(row);

      if (!normalized) {
        rowsSkipped++;
        continue;
      }

      const companyId = companyIdBySymbol.get(normalized.symbol);

      if (!companyId) {
        unmatchedSymbols++;
        this.logger.warn(
          `Skipping corporate action for ${normalized.symbol} because listing is not in database`,
        );
        continue;
      }

      const description = this.buildDescription(normalized);

      const existing = await this.prisma.corporateAction.findFirst({
        where: {
          companyId,
          actionType: normalized.actionType,
          effectiveDate: normalized.effectiveDate,
          sharesOffered: normalized.sharesOffered,
        },
      });

      if (existing) {
        await this.prisma.corporateAction.update({
          where: {
            id: existing.id,
          },
          data: {
            description,
          },
        });
        rowsUpdated++;
        continue;
      }

      await this.prisma.corporateAction.create({
        data: {
          companyId,
          actionType: normalized.actionType,
          effectiveDate: normalized.effectiveDate,
          sharesOffered: normalized.sharesOffered,
          description,
        },
      });
      rowsInserted++;
    }

    this.logger.log(
      `Corporate action sync complete. fetched=${rows.length} inserted=${rowsInserted} updated=${rowsUpdated} skipped=${rowsSkipped} unmatchedSymbols=${unmatchedSymbols}`,
    );

    return {
      rowsFetched: rows.length,
      rowsInserted,
      rowsUpdated,
      rowsSkipped,
      unmatchedSymbols,
    };
  }

  private async fetchCorporateActions(): Promise<CorporateActionApiItem[]> {
    const endpoint = this.buildPythonBackendUrl('corporate-action');

    try {
      const response = await axios.get<CorporateActionApiResponse>(endpoint, {
        timeout: 30000,
      });

      return response.data?.data ?? [];
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const body =
        typeof axiosError.response?.data === 'string'
          ? axiosError.response?.data.slice(0, 200)
          : JSON.stringify(axiosError.response?.data).slice(0, 200);

      throw new Error(
        `Failed to fetch corporate actions. status=${status ?? 'N/A'} body=${body ?? 'N/A'}`,
      );
    }
  }

  private normalizeRow(
    row: CorporateActionApiItem,
  ): NormalizedCorporateAction | null {
    const symbol = row.KodeEmiten?.trim().toUpperCase();
    const rawActionType = row.JenisTindakan?.trim();
    const actionType = this.mapActionType(rawActionType);
    const effectiveDate = this.parseDate(row.TanggalPencatatan);

    if (!symbol || !rawActionType || !actionType || !effectiveDate) {
      this.logger.warn(
        `Skipping invalid corporate action row: ${JSON.stringify(row)}`,
      );
      return null;
    }

    return {
      sourceId: row.id ?? null,
      symbol,
      actionType,
      rawActionType,
      effectiveDate,
      sharesOffered: this.toBigIntOrNull(row.JumlahSaham),
      sharesAfterAction: this.toBigIntOrNull(row.JumlahSahamSetelahTindakan),
    };
  }

  private mapActionType(value?: string): CorporateActionType | null {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    if (normalized.includes('waran')) {
      return CorporateActionType.WARRANT_ISSUANCE;
    }

    if (
      normalized.includes('obligasiwajibkonversi') ||
      normalized.includes('konversi')
    ) {
      return CorporateActionType.WARRANT_ISSUANCE;
    }

    if (normalized.includes('rights') || normalized.includes('hmetd')) {
      return CorporateActionType.RIGHTS_ISSUE;
    }

    if (
      normalized.includes('stocksplit') ||
      normalized.includes('stock split')
    ) {
      return CorporateActionType.STOCK_SPLIT;
    }

    if (normalized.includes('reverse')) {
      return CorporateActionType.REVERSE_SPLIT;
    }

    if (
      normalized.includes('dividen saham') ||
      normalized.includes('stockdividend')
    ) {
      return CorporateActionType.STOCK_DIVIDEND;
    }

    if (normalized.includes('buyback')) {
      return CorporateActionType.BUYBACK;
    }

    if (normalized.includes('merger')) {
      return CorporateActionType.MERGER;
    }

    return null;
  }

  private buildDescription(row: NormalizedCorporateAction): string {
    return [
      `source=python-backend`,
      `sourceId=${row.sourceId ?? 'N/A'}`,
      `rawActionType=${row.rawActionType}`,
      `symbol=${row.symbol}`,
      `sharesAfterAction=${row.sharesAfterAction?.toString() ?? 'N/A'}`,
    ].join('; ');
  }

  private parseDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const normalized = value.slice(0, 10);
    const parsed = new Date(`${normalized}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private toBigIntOrNull(value?: number): bigint | null {
    if (value == null) {
      return null;
    }

    return BigInt(Math.trunc(value));
  }

  private buildPythonBackendUrl(path: string): string {
    return new URL(
      path,
      `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`,
    ).toString();
  }
}
