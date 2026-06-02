import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { PubExDocumentType, PubExStatus, Prisma } from '@prisma/client';
import axios from 'axios';

import { PrismaService } from '../../prisma/prisma.service';
import { PubExGateway } from './pubex.gateway';
import { UploadSinglePubExDto } from './dto/upload-single-pubex.dto';

type CallbackPayload = {
  status: 'DONE' | 'FAILED';
  confidence?: number;
  errorMessage?: string;
  result?: {
    segments?: Array<{
      segmentName?: string;
      metricName?: string;
      value?: number;
      unit?: string;
      period?: string;
      growthYoy?: number;
      contribution?: number;
    }>;
  };
};

@Injectable()
export class PubExService {
  private readonly uploadDir = path.resolve(process.cwd(), 'storage', 'pubex');
  private readonly pythonParserUrl =
    process.env.PYTHON_PUBEX_PARSE_URL ?? 'http://127.0.0.1:5000/api/parse/pubex';
  private readonly callbackBaseUrl =
    process.env.PUBEX_CALLBACK_BASE_URL ?? 'http://127.0.0.1:8080/api/v1';

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('pubex-parse') private readonly queue: Queue,
    private readonly pubExGateway: PubExGateway,
  ) {}

  async uploadSingle(file: Express.Multer.File, body: UploadSinglePubExDto) {
    const stored = await this.persistFile(file);
    const jobId = randomUUID();
    const company = await this.prisma.company.findFirst({
      where: {
        listings: {
          some: {
            symbol: {
              equals: body.ticker,
              mode: 'insensitive',
            },
          },
        },
      },
      select: { id: true },
    });
    if (!company?.id) {
      throw new BadRequestException(`Ticker ${body.ticker} not found`);
    }

    const row = await this.prisma.pubEx.create({
      data: {
        jobId,
        companyId: company.id,
        fiscalYear: body.year,
        documentType: this.mapReportType(body.reportType),
        originalFileName: file.originalname,
        filePath: stored.filePath,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: PubExStatus.PENDING,
      },
    });

    await this.queue.add('parse-pubex', { pubExId: row.id, jobId });
    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status,
    };
  }

  async uploadBulk(files: Express.Multer.File[]) {
    const created: Array<{ id: string; jobId: string | null; status: PubExStatus; fileName: string }> = [];
    for (const file of files) {
      const parsed = this.parseMetadataFromFilename(file.originalname);
      const result = await this.uploadSingle(file, parsed);
      created.push({ ...result, fileName: file.originalname });
    }

    return {
      total: created.length,
      items: created,
    };
  }

  async processJob(pubExId: string) {
    const pubEx = await this.prisma.pubEx.findUnique({
      where: { id: pubExId },
      include: {
        company: {
          include: {
            listings: {
              select: { symbol: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!pubEx) {
      throw new NotFoundException(`PubEx ${pubExId} not found`);
    }
    if (!pubEx.jobId) {
      throw new BadRequestException(`PubEx ${pubExId} has no jobId`);
    }

    await this.prisma.pubEx.update({
      where: { id: pubEx.id },
      data: { status: PubExStatus.PROCESSING },
    });

    const fileBuffer = await readFile(pubEx.filePath);
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), pubEx.originalFileName);
    form.append('ticker', pubEx.company.listings[0]?.symbol ?? '');
    form.append('issuerName', pubEx.company.displayName);
    form.append('year', String(pubEx.fiscalYear));
    form.append('reportType', pubEx.documentType);
    form.append('jobId', pubEx.jobId);
    form.append('callbackUrl', `${this.callbackBaseUrl}/pubex/callback/${pubEx.jobId}`);

    await axios.post(this.pythonParserUrl, form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    });
  }

  async handleCallback(jobId: string, payload: CallbackPayload) {
    const pubEx = await this.prisma.pubEx.findUnique({
      where: { jobId },
      select: {
        id: true,
        jobId: true,
        company: {
          include: {
            listings: {
              select: { symbol: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!pubEx) {
      throw new NotFoundException(`PubEx job ${jobId} not found`);
    }

    const mappedStatus = payload.status === 'DONE' ? PubExStatus.DONE : PubExStatus.FAILED;

    await this.prisma.$transaction(async (tx) => {
      await tx.pubEx.update({
        where: { id: pubEx.id },
        data: {
          status: mappedStatus,
          confidence:
            payload.confidence != null
              ? new Prisma.Decimal(payload.confidence).toDecimalPlaces(4)
              : null,
          errorMessage: payload.errorMessage ?? null,
          result: (payload.result ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
          processedAt: new Date(),
        },
      });

      await tx.pubExSegment.deleteMany({
        where: { pubExId: pubEx.id },
      });

      const segments = payload.result?.segments ?? [];
      if (segments.length > 0) {
        await tx.pubExSegment.createMany({
          data: segments.map((segment) => ({
            pubExId: pubEx.id,
            segmentName: segment.segmentName ?? 'Unknown',
            metricName: segment.metricName ?? 'Unknown',
            value: segment.value != null ? new Prisma.Decimal(segment.value) : null,
            unit: segment.unit ?? null,
            period: segment.period ?? null,
            growthYoy:
              segment.growthYoy != null ? new Prisma.Decimal(segment.growthYoy) : null,
            contribution:
              segment.contribution != null
                ? new Prisma.Decimal(segment.contribution)
                : null,
          })),
        });
      }
    });

    this.pubExGateway.emitJobUpdated({
      jobId: pubEx.jobId,
      ticker: pubEx.company.listings[0]?.symbol ?? null,
      status: mappedStatus,
      confidence: payload.confidence ?? null,
      errorMessage: payload.errorMessage ?? null,
    });

    return { success: true };
  }

  private async persistFile(file: Express.Multer.File) {
    await mkdir(this.uploadDir, { recursive: true });
    const safeName = `${Date.now()}-${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(this.uploadDir, safeName);
    await writeFile(filePath, file.buffer);

    return {
      filePath,
      fileName: safeName,
    };
  }

  private parseMetadataFromFilename(fileName: string): UploadSinglePubExDto {
    const base = path.basename(fileName, path.extname(fileName));
    const parts = base.split(/[_\s-]+/).filter(Boolean);

    const ticker = (parts[0] ?? 'UNKNOWN').toUpperCase();
    const yearPart = parts.find((p) => /^\d{4}$/.test(p)) ?? String(new Date().getUTCFullYear());
    const year = Number.parseInt(yearPart, 10);

    return {
      ticker,
      issuerName: ticker,
      year,
      reportType: 'Public Expose',
    };
  }

  private mapReportType(reportType: string): PubExDocumentType {
    const normalized = reportType.trim().toUpperCase();
    if (normalized.includes('PAPARAN')) {
      return PubExDocumentType.PAPARAN_PUBLIK;
    }
    if (normalized.includes('ANNUAL')) {
      return PubExDocumentType.ANNUAL_REPORT;
    }

    return PubExDocumentType.PUBLIC_EXPOSE;
  }
}
