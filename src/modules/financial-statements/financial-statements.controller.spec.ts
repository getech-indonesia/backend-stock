import { Test, TestingModule } from '@nestjs/testing';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';

describe('FinancialStatementsController', () => {
  let controller: FinancialStatementsController;
  let service: FinancialStatementsService;

  const mockFinancialStatementsService = {
    deAccumulateStatements: jest.fn(),
    uploadXbrl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialStatementsController],
      providers: [
        {
          provide: FinancialStatementsService,
          useValue: mockFinancialStatementsService,
        },
      ],
    }).compile();

    controller = module.get<FinancialStatementsController>(FinancialStatementsController);
    service = module.get<FinancialStatementsService>(FinancialStatementsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('deAccumulate', () => {
    it('should call service deAccumulateStatements method', async () => {
      const mockDto = { incomeStatement: { companyId: '123' } };
      mockFinancialStatementsService.deAccumulateStatements.mockResolvedValue({ incomeStatement: { companyId: '123' } });

      const result = await controller.deAccumulate(mockDto);

      expect(service.deAccumulateStatements).toHaveBeenCalledWith(mockDto);
      expect(result).toEqual({ incomeStatement: { companyId: '123' } });
    });
  });
});
