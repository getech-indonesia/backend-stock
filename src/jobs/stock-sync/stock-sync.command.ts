import { Command, CommandRunner } from 'nest-commander';

import { StockSyncService } from './stock-sync.service';

@Command({
    name: 'stock:sync:id',
    description:
        'Sync Indonesia stock data from EMITEN_API_URL and persist page by page',
})
export class StockSyncCommand extends CommandRunner {

    constructor(
        private readonly stockSyncService: StockSyncService,
    ) {
        super();
    }

    async run(): Promise<void> {
        await this.stockSyncService.syncIndonesia();
    }

}
