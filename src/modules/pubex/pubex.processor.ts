import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { PubExService } from './pubex.service';

@Processor('pubex-parse')
export class PubExProcessor extends WorkerHost {
  private readonly logger = new Logger(PubExProcessor.name);

  constructor(private readonly pubExService: PubExService) {
    super();
  }

  async process(job: Job<{ pubExId: string; jobId: string }>) {
    try {
      await this.pubExService.processJob(job.data.pubExId);
    } catch (error) {
      this.logger.error(`Failed to process pubex job ${job.data.jobId}`, error as Error);
      throw error;
    }
  }
}

