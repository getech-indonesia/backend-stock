import { Command, CommandRunner } from 'nest-commander';

import { SharesDataSyncService } from './sync/shares-data-sync.service';

@Command({
    name: 'stock:sync:shares:id',
    description:
        'Sync shares data from Python backend for all IDX emitens',
})
export class SharesDataSyncCommand extends CommandRunner {

    constructor(
        private readonly sharesDataSyncService: SharesDataSyncService,
    ) {
        super();
    }

    async run(): Promise<void> {
        await this.sharesDataSyncService.syncAllFromPython();
    }

}
