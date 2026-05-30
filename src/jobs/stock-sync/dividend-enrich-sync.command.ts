import { Command, CommandRunner } from 'nest-commander';

import { DividendEnrichSyncService } from './sync/dividend-enrich-sync.service';

@Command({
  name: 'stock:sync:dividend:enrich:id',
  description: 'Enrich dividend derived metrics (DPS/Payout Ratio/Dividend Yield)',
})
export class DividendEnrichSyncCommand extends CommandRunner {
  constructor(
    private readonly dividendEnrichSyncService: DividendEnrichSyncService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.dividendEnrichSyncService.enrichAll();
  }
}

