import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListingsService } from './listings.service';
import { ListingScoreCalculator } from './services/listing-score.calculator';

describe('ListingsService', () => {
  let service: ListingsService;

  const mockPrismaService = {
    listingScore: {
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockListingScoreCalculator = {
    calculateRScoreUniverse: jest.fn(),
    getGroveWeights: jest.fn(),
    calculateGroveWeightedTotal: jest.fn(),
  };

  const baseScoreRow = (
    listingId: string,
    symbol: string,
    companyId: string,
    score: number,
  ) => ({
    listingId,
    gScore: score,
    rScore: score,
    oScore: null,
    vScore: null,
    eScore: null,
    totalScore: score,
    stance:
      score >= 70 ? 'Overweight' : score >= 55 ? 'Neutral' : 'Underweight',
    breakdown: {
      g: { score, maxScore: 100, details: {} },
      r: { score: null, maxScore: 0, details: null, status: 'not_implemented' },
      o: { score: null, maxScore: 0, details: null, status: 'not_implemented' },
      v: { score: null, maxScore: 0, details: null, status: 'not_implemented' },
      e: { score: null, maxScore: 0, details: null, status: 'not_implemented' },
    },
    listing: {
      id: listingId,
      symbol,
      stockPrices: [
        {
          date: new Date('2026-07-14T00:00:00.000Z'),
          close: new Prisma.Decimal(score),
        },
        {
          date: new Date('2026-07-13T00:00:00.000Z'),
          close: new Prisma.Decimal(score - 1),
        },
      ],
      company: {
        id: companyId,
        displayName: `Company ${symbol}`,
        logoUrl: null,
        industry: {
          id: 'industry-1',
          name: 'Industry',
          sector: {
            id: 'sector-1',
            name: 'Sector',
          },
        },
      },
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ListingScoreCalculator,
          useValue: mockListingScoreCalculator,
        },
      ],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reads listing scores from database and requests descending order by default', async () => {
    mockPrismaService.listingScore.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);
    mockPrismaService.listingScore.findMany.mockResolvedValue([
      baseScoreRow('listing-1', 'AAA', 'company-1', 30),
      baseScoreRow('listing-3', 'CCC', 'company-3', 20),
    ]);
    mockListingScoreCalculator.calculateRScoreUniverse.mockResolvedValue({});

    const result = await service.getListingScores({
      page: 1,
      pageSize: 2,
    });

    expect(mockPrismaService.listingScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ totalScore: 'desc' }, { listing: { symbol: 'asc' } }],
      }),
    );
    expect(result.items.map((item) => item.symbol)).toEqual(['AAA', 'CCC']);
    expect(result.items.every((item) => item.r !== null)).toBe(true);
    expect(result.items[0]?.latestPrice).toMatchObject({
      latestDate: '2026-07-14T00:00:00.000Z',
      previousDate: '2026-07-13T00:00:00.000Z',
    });
    expect(result.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('requests ascending score order when asked', async () => {
    mockPrismaService.listingScore.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);
    mockPrismaService.listingScore.findMany.mockResolvedValue([
      baseScoreRow('listing-2', 'BBB', 'company-2', 10),
      baseScoreRow('listing-3', 'CCC', 'company-3', 20),
    ]);
    mockListingScoreCalculator.calculateRScoreUniverse.mockResolvedValue({});

    const result = await service.getListingScores({
      page: 1,
      pageSize: 3,
      sortOrder: 'asc',
    });

    expect(mockPrismaService.listingScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ totalScore: 'asc' }, { listing: { symbol: 'asc' } }],
      }),
    );
    expect(result.items.map((item) => item.symbol)).toEqual(['BBB', 'CCC']);
  });
});
