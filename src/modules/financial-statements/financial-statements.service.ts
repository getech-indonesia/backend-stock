import { Injectable, Logger, InternalServerErrorException, BadGatewayException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios, { AxiosError } from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { DeAccumulateFinancialStatementsDto } from './dto/de-accumulate-financial-statements.dto';

@Injectable()
export class FinancialStatementsService {
  private readonly logger = new Logger(FinancialStatementsService.name);
  private s3Client: S3Client | null = null;

  private readonly pythonBackendBaseUrl =
    process.env.PYTHON_BACKEND_BASE_URL ?? 'http://127.0.0.1:5000/api';

  constructor(private readonly prisma: PrismaService) {
    this.initS3Client();
  }

  private initS3Client() {
    const endpoint = process.env.S3_ENDPOINT_URL;
    const bucket = process.env.S3_BUCKET_NAME;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;
    const region = process.env.S3_REGION ?? 'us-east-1';

    if (!endpoint || !bucket || !accessKey || !secretKey) {
      this.logger.warn(
        'S3 configurations are incomplete in environment variables. S3 uploads might fail.',
      );
      return;
    }

    try {
      this.s3Client = new S3Client({
        endpoint,
        region,
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
        forcePathStyle: true,
      });
      this.logger.log('S3 Client successfully initialized.');
    } catch (error) {
      this.logger.error('Failed to initialize S3 Client', error);
    }
  }

  private buildPythonBackendUrl(path: string): string {
    return new URL(path, `${this.pythonBackendBaseUrl.replace(/\/+$/, '')}/`).toString();
  }

  private resolvePythonExtractionPath(filename: string): string {
    return filename.toLowerCase().endsWith('.pdf') ? 'extract-financial-report' : 'extract-xbrl';
  }

  private async createSignedFileUrl(key: string): Promise<string> {
    if (!this.s3Client || !process.env.S3_BUCKET_NAME) {
      throw new InternalServerErrorException('S3 client is not configured.');
    }

    return getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
      }),
      { expiresIn: 60 * 30 },
    );
  }

  async uploadXbrl(file: Express.Multer.File) {
    const bucket = process.env.S3_BUCKET_NAME;
    const endpoint = process.env.S3_ENDPOINT_URL;

    if (!this.s3Client || !bucket || !endpoint) {
      throw new InternalServerErrorException(
        'S3 client is not configured. Please check your environment variables.',
      );
    }

    const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const originalNameSanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `xbrl/${uniqueId}-${originalNameSanitized}`;

    this.logger.log(`Uploading file ${file.originalname} to S3 bucket ${bucket} as key: ${key}`);

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/zip',
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully uploaded ${key} to S3`);
    } catch (error) {
      this.logger.error(`S3 upload failed for ${key}`, error);
      throw new InternalServerErrorException(`Failed to upload file to storage: ${error.message}`);
    }

    const signedUrl = await this.createSignedFileUrl(key);
    const triggerPath = this.resolvePythonExtractionPath(file.originalname);
    this.logger.log(`File upload succeeded. Signed URL expires in 30 minutes: ${signedUrl}`);

    const triggerUrl = this.buildPythonBackendUrl(triggerPath);
    this.logger.log(`Triggering Python extraction endpoint at: ${triggerUrl}`);

    try {
      const response = await axios.post(
        triggerUrl,
        {
          url: signedUrl,
          s3_url: signedUrl,
          file_url: signedUrl,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 1800000,
        },
      );

      this.logger.log(`Python backend response status: ${response.status}`);
      return {
        message:
          triggerPath === 'extract-financial-report'
            ? 'PDF file uploaded and extraction triggered successfully'
            : 'XBRL file uploaded and extraction triggered successfully',
        signedUrl,
        pythonResponse: response.data,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data;

      this.logger.error(
        `Failed to trigger Python extraction. status=${status ?? 'N/A'}, response=${JSON.stringify(responseData) ?? 'N/A'}`,
        error,
      );

      throw new BadGatewayException({
        message:
          triggerPath === 'extract-financial-report'
            ? 'PDF uploaded successfully, but triggering Python backend failed.'
            : 'XBRL uploaded successfully, but triggering Python backend failed.',
        signedUrl,
        error: responseData || axiosError.message,
      });
    }
  }

  async deAccumulateStatements(body: DeAccumulateFinancialStatementsDto) {
    const EXCLUDED_KEYS = new Set([
      'id',
      'companyId',
      'period',
      'fiscalYear',
      'fiscalQuarter',
      'periodEndDate',
      'currency',
      'auditStatus',
      'createdAt',
      'updatedAt',
      'eps',
      'epsDiluted',
      'sharesWeightedAvg',
      'effectiveTaxRate',
      'revenueGrowthYoY',
      'bookValuePerShare',
    ]);

    const result: any = {};

    const modelMapping: Record<string, string> = {
      incomeStatement: 'incomeStatement',
      balanceSheet: 'balanceSheet',
      cashFlow: 'cashFlowStatement',
    };

    for (const [key, item] of Object.entries(body)) {
      if (!item) {
        result[key] = null;
        continue;
      }

      const modelName = modelMapping[key];
      if (!modelName) {
        result[key] = item;
        continue;
      }

      const companyId = item.companyId;
      const fiscalYear = item.fiscalYear;
      let fiscalQuarter = item.fiscalQuarter;
      let period = item.period;

      if (!companyId || !fiscalYear) {
        result[key] = item;
        continue;
      }

      if (!fiscalQuarter && period) {
        const match = period.match(/^Q(\d)$/i);
        if (match) {
          fiscalQuarter = parseInt(match[1], 10);
        }
      }

      if (fiscalQuarter && !period) {
        period = `Q${fiscalQuarter}`;
      }

      if (typeof fiscalQuarter !== 'number' || fiscalQuarter <= 1) {
        result[key] = item;
        continue;
      }

      const prevQuarter = fiscalQuarter - 1;
      const prevPeriod = `Q${prevQuarter}`;

      const previousStatement = await (this.prisma[modelName] as any).findFirst({
        where: {
          companyId,
          fiscalYear,
          fiscalQuarter: prevQuarter,
          period: prevPeriod,
        },
      });

      if (!previousStatement) {
        result[key] = item;
        continue;
      }

      const adjustedItem: any = {};
      for (const [fieldKey, reqVal] of Object.entries(item)) {
        if (EXCLUDED_KEYS.has(fieldKey)) {
          adjustedItem[fieldKey] = reqVal;
          continue;
        }

        if (reqVal === null || reqVal === undefined) {
          adjustedItem[fieldKey] = null;
          continue;
        }

        if (typeof reqVal !== 'number') {
          adjustedItem[fieldKey] = reqVal;
          continue;
        }

        const dbVal = previousStatement[fieldKey];
        let numericDbVal = 0;

        if (dbVal !== null && dbVal !== undefined) {
          if (typeof dbVal === 'number') {
            numericDbVal = dbVal;
          } else if (typeof dbVal === 'object' && typeof dbVal.toNumber === 'function') {
            numericDbVal = dbVal.toNumber();
          } else if (typeof dbVal === 'bigint') {
            numericDbVal = Number(dbVal);
          } else {
            const parsed = parseFloat(dbVal);
            if (!isNaN(parsed)) {
              numericDbVal = parsed;
            }
          }
        }

        adjustedItem[fieldKey] = reqVal - numericDbVal;
      }

      result[key] = adjustedItem;
    }

    return result;
  }
}