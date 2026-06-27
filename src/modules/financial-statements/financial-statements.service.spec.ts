import { Test, TestingModule } from '@nestjs/testing';
import { FinancialStatementsService } from './financial-statements.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FinancialStatementsService', () => {
  let service: FinancialStatementsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    incomeStatement: {
      findFirst: jest.fn(),
    },
    balanceSheet: {
      findFirst: jest.fn(),
    },
    cashFlowStatement: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialStatementsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<FinancialStatementsService>(FinancialStatementsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deAccumulateStatements', () => {
    it('should de-accumulate values correctly when previous quarter exists', async () => {
      const companyId = 'c45c47c5-d030-4d8b-a3cf-7cb704ef8732';
      
      const reqBody = {
        incomeStatement: {
          companyId,
          fiscalYear: 2025,
          fiscalQuarter: 2,
          period: 'Q2',
          revenue: 100,
          eps: 1.5, // should not be de-accumulated
          netIncome: 50,
          currency: 'IDR', // should not be de-accumulated
        },
      };

      const dbPrevQuarter = {
        companyId,
        fiscalYear: 2025,
        fiscalQuarter: 1,
        period: 'Q1',
        revenue: 40,
        eps: 0.8,
        netIncome: 20,
        currency: 'IDR',
      };

      mockPrismaService.incomeStatement.findFirst.mockResolvedValue(dbPrevQuarter);

      const result = await service.deAccumulateStatements(reqBody);

      expect(mockPrismaService.incomeStatement.findFirst).toHaveBeenCalledWith({
        where: {
          companyId,
          fiscalYear: 2025,
          fiscalQuarter: 1,
          period: 'Q1',
        },
      });

      expect(result.incomeStatement.revenue).toBe(60); // 100 - 40
      expect(result.incomeStatement.netIncome).toBe(30); // 50 - 20
      expect(result.incomeStatement.eps).toBe(1.5); // unchanged
      expect(result.incomeStatement.currency).toBe('IDR'); // unchanged
    });

    it('should return request data as is if previous quarter is not found', async () => {
      const companyId = 'c45c47c5-d030-4d8b-a3cf-7cb704ef8732';
      
      const reqBody = {
        incomeStatement: {
          companyId,
          fiscalYear: 2025,
          fiscalQuarter: 2,
          period: 'Q2',
          revenue: 100,
        },
      };

      mockPrismaService.incomeStatement.findFirst.mockResolvedValue(null);

      const result = await service.deAccumulateStatements(reqBody);
      expect(result.incomeStatement.revenue).toBe(100);
    });

    it('should return request data as is if quarter is Q1', async () => {
      const companyId = 'c45c47c5-d030-4d8b-a3cf-7cb704ef8732';
      
      const reqBody = {
        incomeStatement: {
          companyId,
          fiscalYear: 2025,
          fiscalQuarter: 1,
          period: 'Q1',
          revenue: 100,
        },
      };

      const result = await service.deAccumulateStatements(reqBody);
      expect(mockPrismaService.incomeStatement.findFirst).not.toHaveBeenCalled();
      expect(result.incomeStatement.revenue).toBe(100);
    });
  });
});
