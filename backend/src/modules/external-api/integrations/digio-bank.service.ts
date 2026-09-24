import { Injectable, Logger, BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { calculateBankNameMatchScore } from '../../../common/utils/name-matcher.helper';

export interface DigioVerifyBankInput {
  accountNo: string;
  ifsc: string;
  name?: string;
  customerName?: string;
  amount?: number;
}

export interface DigioVerifyBankResponse {
  providerReference: string | null;
  verified: boolean;
  verifiedAt: Date | null;
  beneficiaryNameWithBank: string | null;
  fuzzyMatchScore: number | null;
  fuzzyMatchSource?: 'LOCAL' | 'DIGIO' | 'NONE';
  fuzzyMatchReason?: string;
  bankName: string | null;
  branchName: string | null;
  rawResponse: any;
}

@Injectable()
export class DigioBankService {
  private readonly logger = new Logger(DigioBankService.name);
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('DIGIO_BASE_URL') || 'https://ext.digio.in';
    const timeout = this.config.get<number>('DIGIO_TIMEOUT') || 30000;

    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      const clientId = this.config.get<string>('DIGIO_CLIENT_ID') || '';
      const clientSecret = this.config.get<string>('DIGIO_CLIENT_SECRET') || '';

      if (clientId && clientSecret) {
        const credential = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        config.headers['Authorization'] = `Basic ${credential}`;
      }
      return config;
    });
  }

  /**
   * Helper function implementing the new prioritized fuzzy matching flow:
   * 1. Run local fuzzy matcher engine (calculateBankNameMatchScore).
   * 2. If local score > 0 (and matched !== false), return local score and reason (e.g. "SEQUENCE_MATCH").
   * 3. Else only call Digio fuzzy API (/v3/client/kyc/fuzzy_match).
   * 4. If Digio score > 0, return Digio score and reason ("DIGIO_FUZZY_MATCH").
   * 5. Else return score 0, reason "NO_MATCH", source "NONE".
   */
  private async getFinalNameMatchScore(
    customerName: string,
    beneficiaryName: string,
  ): Promise<{
    score: number;
    source: 'LOCAL' | 'DIGIO' | 'NONE';
    reason: string;
  }> {
    const custName = String(customerName || '').trim();
    const benName = String(beneficiaryName || '').trim();

    if (!custName || !benName) {
      return {
        score: 0,
        source: 'NONE',
        reason: 'NO_MATCH',
      };
    }

    // STEP 2: FIRST RUN MY LOCAL FUZZY MATCH ENGINE
    const threshold = Number(this.config.get('DIGIO_BANK_NAME_MATCH_THRESHOLD') || '85');
    const localResult = calculateBankNameMatchScore(custName, benName, threshold);

    // STEP 3: Check local fuzzy score: IF localScore > 0 and matched === true, use localScore, do NOT call Digio API
    if (localResult && localResult.score > 0 && localResult.matched === true) {
      this.logger.debug(
        `Local fuzzy match succeeded for "${custName}" vs "${benName}": score=${localResult.score}, reason=${localResult.reason}`,
      );
      return {
        score: localResult.score,
        source: 'LOCAL',
        reason: localResult.reason || 'SEQUENCE_MATCH',
      };
    }

    // STEP 4: If local fuzzy score is 0 OR matched: false, call Digio fuzzy API
    this.logger.debug(
      `Local fuzzy match score was 0/unmatched for "${custName}" vs "${benName}". Calling Digio fuzzy match API fallback.`,
    );

    try {
      const digioScore = await this.fuzzyMatch({
        sourceText: custName,
        targetText: benName,
        context: 'Name',
        confidence: 75,
      });

      // STEP 5: Process Digio response: If Digio score > 0, use Digio score
      if (digioScore > 0) {
        return {
          score: digioScore,
          source: 'DIGIO',
          reason: 'DIGIO_FUZZY_MATCH',
        };
      }
    } catch (error: any) {
      this.logger.warn(`Digio fallback fuzzy match failed: ${error?.message || error}`);
    }

    // STEP 6: If Digio score also 0, return 0 / NO_MATCH
    return {
      score: 0,
      source: 'NONE',
      reason: 'NO_MATCH',
    };
  }

  async verifyBankAccount(input: DigioVerifyBankInput): Promise<DigioVerifyBankResponse> {
    try {
      const maskedAcc = input.accountNo ? `XXXXXXXX${input.accountNo.slice(-4)}` : 'MISSING';
      this.logger.debug(`Calling Digio Bank Verification for Account: ${maskedAcc}, IFSC: ${input.ifsc}`);

      const clientId = this.config.get<string>('DIGIO_CLIENT_ID') || '';
      const clientSecret = this.config.get<string>('DIGIO_CLIENT_SECRET') || '';

      if (!clientId || !clientSecret) {
        this.logger.warn('DIGIO_CLIENT_ID / DIGIO_CLIENT_SECRET not set in .env. Returning sandbox verification fallback for testing.');
        const customerName = (input.customerName || input.name || 'Vishal Ramashankar Yadav').trim();
        const beneficiaryName = (input.name || 'Vishal R Yadav').trim();
        const matchResult = await this.getFinalNameMatchScore(customerName, beneficiaryName);

        return {
          providerReference: `DIGIO_SANDBOX_${Date.now()}`,
          verified: true,
          verifiedAt: new Date(),
          beneficiaryNameWithBank: beneficiaryName,
          fuzzyMatchScore: matchResult.score,
          fuzzyMatchSource: matchResult.source,
          fuzzyMatchReason: matchResult.reason,
          bankName: 'HDFC Bank',
          branchName: 'Main Branch',
          rawResponse: { mode: 'SANDBOX_FALLBACK', status: 'SUCCESS', verified: true },
        };
      }

      const amount = input.amount || Number(this.config.get<string>('DIGIO_PENNY_AMOUNT') || '1.00');

      const payload = {
        beneficiary_account_no: input.accountNo,
        beneficiary_ifsc: input.ifsc,
        beneficiary_name: input.name,
        amount: String(amount),
      };

      const response = await this.client.post('/client/verify/bank_account', payload);
      const data = response.data || {};

      const providerReference = data.id || data.reference_no || data.transaction_id || null;
      const verified = Boolean(
        data.verified === true ||
        data.status === 'VERIFIED' ||
        data.status === 'SUCCESS'
      );

      const beneficiaryNameWithBank =
        data.beneficiary_name_with_bank ||
        data.beneficiary_name ||
        data.name_at_bank ||
        null;

      let fuzzyMatchScore: number | null = null;
      let fuzzyMatchSource: 'LOCAL' | 'DIGIO' | 'NONE' = 'NONE';
      let fuzzyMatchReason = 'NO_MATCH';

      // STEP 1: After Digio bank verification success, retrieve customerName and beneficiaryNameWithBank
      const customerName = (input.customerName || input.name || '').trim();
      const beneficiaryName = (beneficiaryNameWithBank || input.name || '').trim();

      if (verified && customerName && beneficiaryName) {
        const matchResult = await this.getFinalNameMatchScore(customerName, beneficiaryName);
        fuzzyMatchScore = matchResult.score;
        fuzzyMatchSource = matchResult.source;
        fuzzyMatchReason = matchResult.reason;
      } else if (data.fuzzy_match_score !== undefined && data.fuzzy_match_score !== null) {
        fuzzyMatchScore = Number(data.fuzzy_match_score);
        fuzzyMatchSource = 'DIGIO';
        fuzzyMatchReason = 'DIGIO_FUZZY_MATCH';
      }

      const bankName = data.bank_name || data.bank_details?.bank_name || null;
      const branchName = data.branch_name || data.bank_details?.branch_name || null;
      const verifiedAt = data.verified_at ? new Date(data.verified_at) : new Date();

      return {
        providerReference,
        verified,
        verifiedAt,
        beneficiaryNameWithBank,
        fuzzyMatchScore,
        fuzzyMatchSource,
        fuzzyMatchReason,
        bankName,
        branchName,
        rawResponse: data,
      };
    } catch (error: any) {
      this.logger.error(`Digio verify/bank_account error: ${error?.message || error}`);

      if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT' || error?.message?.includes('timeout')) {
        throw new ServiceUnavailableException('Digio Bank Verification service is temporarily unavailable. Please try again.');
      }

      const responseData = error?.response?.data;
      if (responseData) {
        return {
          providerReference: responseData.id || null,
          verified: false,
          verifiedAt: null,
          beneficiaryNameWithBank: null,
          fuzzyMatchScore: null,
          fuzzyMatchSource: 'NONE',
          fuzzyMatchReason: 'NO_MATCH',
          bankName: null,
          branchName: null,
          rawResponse: responseData,
        };
      }

      throw new BadGatewayException(`Provider Error: ${error?.message || 'Bank verification failed.'}`);
    }
  }

  async fuzzyMatch(input: {
    sourceText: string;
    targetText: string;
    context?: string;
    confidence?: number;
  }): Promise<number> {
    try {
      const payload = {
        context: input.context || 'Name',
        source: {
          text: input.sourceText,
        },
        target: {
          text: input.targetText,
        },
        confidence: input.confidence || 75,
      };

      const response = await this.client.post('/v3/client/kyc/fuzzy_match', payload);
      const data = response.data || {};

      const score = data.match_score || data.fuzzy_match_score || data.confidence_score || 0;
      return Number(score);
    } catch (error: any) {
      this.logger.warn(`Digio fuzzy_match failed: ${error?.message || error}`);
      return 0;
    }
  }
}
