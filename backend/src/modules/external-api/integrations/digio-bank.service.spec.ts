import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DigioBankService } from './digio-bank.service';

describe('DigioBankService Name Matching Priority', () => {
  let service: DigioBankService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'DIGIO_BASE_URL') return 'https://ext.digio.in';
        if (key === 'DIGIO_CLIENT_ID') return 'mock-client-id';
        if (key === 'DIGIO_CLIENT_SECRET') return 'mock-client-secret';
        if (key === 'DIGIO_BANK_NAME_MATCH_THRESHOLD') return '85';
        return null;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigioBankService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<DigioBankService>(DigioBankService);
  });

  it('STEP 2 & 3: Uses local fuzzy match score when localScore > 0 without calling Digio fuzzy API', async () => {
    const fuzzyMatchSpy = jest.spyOn(service, 'fuzzyMatch');

    // Customer Name: "Vishal Ramashankar Yadav", Beneficiary: "Vishal R Yadav"
    const result = await (service as any).getFinalNameMatchScore(
      'Vishal Ramashankar Yadav',
      'Vishal R Yadav',
    );

    expect(result.score).toBeGreaterThan(0);
    expect(result.source).toBe('LOCAL');
    expect(result.reason).toBe('SEQUENCE_MATCH');
    expect(fuzzyMatchSpy).not.toHaveBeenCalled();
  });

  it('STEP 4 & 5: Falls back to Digio fuzzy API when local match is 0 or unmatched', async () => {
    const fuzzyMatchSpy = jest.spyOn(service, 'fuzzyMatch').mockResolvedValue(80);

    // Completely disjoint names that local matcher scores 0 or < threshold
    const result = await (service as any).getFinalNameMatchScore(
      'Suresh Chandra Gupta',
      'Ramesh Kumar Verma',
    );

    expect(fuzzyMatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: 'Suresh Chandra Gupta',
        targetText: 'Ramesh Kumar Verma',
        context: 'Name',
        confidence: 75,
      }),
    );
    expect(result.score).toBe(80);
    expect(result.source).toBe('DIGIO');
    expect(result.reason).toBe('DIGIO_FUZZY_MATCH');
  });

  it('STEP 6: Returns score 0 and NO_MATCH when both local and Digio scores are 0', async () => {
    jest.spyOn(service, 'fuzzyMatch').mockResolvedValue(0);

    const result = await (service as any).getFinalNameMatchScore(
      'A B C',
      'X Y Z',
    );

    expect(result.score).toBe(0);
    expect(result.source).toBe('NONE');
    expect(result.reason).toBe('NO_MATCH');
  });
});
