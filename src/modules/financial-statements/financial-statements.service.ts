import { Injectable, Logger, InternalServerErrorException, BadGatewayException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios, { AxiosError } from 'axios';

@Injectable()
export class FinancialStatementsService {
  private readonly logger = new Logger(FinancialStatementsService.name);
  private s3Client: S3Client | null = null;

  private readonly pythonBackendBaseUrl =
    process.env.PYTHON_BACKEND_BASE_URL ?? 'http://127.0.0.1:5000/api';

  constructor() {
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

    // Construct the public S3 URL
    const s3Url = `${endpoint.replace(/\/+$/, '')}/${bucket}/${key}`;
    this.logger.log(`Constructed S3 URL: ${s3Url}`);

    // Trigger Python extraction endpoint
    const triggerUrl = this.buildPythonBackendUrl('extract-xbrl');
    this.logger.log(`Triggering Python extraction endpoint at: ${triggerUrl}`);

    try {
      const response = await axios.post(
        triggerUrl,
        {
          url: s3Url,
          s3_url: s3Url,
          file_url: s3Url,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 60s timeout for extraction initiation
        },
      );

      this.logger.log(`Python backend response status: ${response.status}`);
      return {
        message: 'XBRL file uploaded and extraction triggered successfully',
        s3Url,
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
        message: 'XBRL uploaded successfully, but triggering Python backend failed.',
        s3Url,
        error: responseData || axiosError.message,
      });
    }
  }
}
