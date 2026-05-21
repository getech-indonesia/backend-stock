import { Command, CommandRunner } from 'nest-commander';

import { CorporateActionSyncService } from './sync/corporate-action-sync.service';

@Command({
  name: 'stock:sync:corporate-action:id',
  description: 'Sync IDX corporate actions from Python backend',
})
export class CorporateActionSyncCommand extends CommandRunner {
  constructor(
    private readonly corporateActionSyncService: CorporateActionSyncService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.corporateActionSyncService.syncAllFromPython();
  }
}
