import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FinancialStatementsService } from './financial-statements.service';

@Controller('admin/financial-statements')
export class FinancialStatementsController {
  constructor(private readonly financialStatementsService: FinancialStatementsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    this.validateZipFile(file);
    return this.financialStatementsService.uploadXbrl(file);
  }

  @Post('upload-xbrl')
  @UseInterceptors(FileInterceptor('file'))
  async uploadXbrl(@UploadedFile() file: Express.Multer.File) {
    this.validateZipFile(file);
    return this.financialStatementsService.uploadXbrl(file);
  }

  private validateZipFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const mimeType = file.mimetype;

    const allowedMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'multipart/x-zip',
      'application/x-compressed',
    ];

    if (extension !== 'zip' && !allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException('Only ZIP files are allowed');
    }
  }
}
