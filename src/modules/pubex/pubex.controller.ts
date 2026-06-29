import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';

import { AdminAuth } from '../../common/decorators/admin-auth.decorator';
import { UploadSinglePubExDto } from './dto/upload-single-pubex.dto';
import { PubExService } from './pubex.service';

@Controller('pubex')
export class PubExController {
  constructor(private readonly pubExService: PubExService) {}

  @Post('upload/single')
  @AdminAuth()
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadSinglePubExDto,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.pubExService.uploadSingle(file, body);
  }

  @Post('upload/bulk')
  @AdminAuth()
  @UseInterceptors(FilesInterceptor('files', 50))
  async uploadBulk(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('files is required');
    }
    return this.pubExService.uploadBulk(files);
  }

  @Post('callback/:jobId')
  async callback(
    @Param('jobId') jobId: string,
    @Body()
    body: {
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
    },
  ) {
    return this.pubExService.handleCallback(jobId, body);
  }
}

