import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ShareholdingsService } from './shareholdings.service';

describe('ShareholdingsService', () => {
  let service: ShareholdingsService;

  const mockPrismaService = {
    shareholding: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const validShareholding = {
    id: 'shareholding-1',
    companyId: 'company-1',
    date: new Date('2026-07-03T00:00:00.000Z'),
    shareholderName: 'Alpha Fund',
    shareholderType: 'INSTITUTIONAL',
    managementId: null,
    sharesHeld: BigInt(1000),
    percentageOwned: new Prisma.Decimal('12.3400'),
    currency: 'IDR',
    createdAt: new Date('2026-07-03T00:00:00.000Z'),
    updatedAt: new Date('2026-07-03T00:00:00.000Z'),
    company: {
      id: 'company-1',
      displayName: 'Alpha',
      legalName: 'Alpha Corp',
      logoUrl: null,
    },
    management: null,
  };

  const invalidShareholding = {
    ...validShareholding,
    id: 'shareholding-2',
    date: new Date('invalid'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShareholdingsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ShareholdingsService>(ShareholdingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should skip shareholdings with invalid date values when listing', async () => {
    mockPrismaService.shareholding.findMany.mockResolvedValue([
      validShareholding,
      invalidShareholding,
    ]);

    const warnSpy = jest
      .spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    const result = await service.findAllByCompanyAdmin('company-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(validShareholding.id);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('shareholding-2'),
    );
  });

  it('should fail clearly when a single shareholding has invalid date data', async () => {
    mockPrismaService.shareholding.findUnique.mockResolvedValue(invalidShareholding);

    await expect(service.findOneAdmin('shareholding-2')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
