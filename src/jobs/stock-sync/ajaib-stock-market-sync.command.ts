import { Command, CommandRunner } from 'nest-commander';

import { AjaibStockMarketSyncService } from './sync/ajaib-stock-market-sync.service';

@Command({
    name: 'stock:sync:ajaib-stock-market',
    description: 'Sync Ajaib stock market snapshots from Python backend',
})
export class AjaibStockMarketSyncCommand extends CommandRunner {
    constructor(
        private readonly ajaibStockMarketSyncService: AjaibStockMarketSyncService,
    ) {
        super();
    }

    async run(): Promise<void> {
        const result =
            await this.ajaibStockMarketSyncService.syncAllFromPython();

        console.log(
            `Done. listingsProcessed=${result.listingsProcessed} listingsSucceeded=${result.listingsSucceeded} listingsFailed=${result.listingsFailed} listingsSkipped=${result.listingsSkipped} upserted=${result.upserted}`,
        );
    }
}