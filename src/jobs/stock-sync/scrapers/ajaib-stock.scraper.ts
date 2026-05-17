import {
    Injectable,
    Logger,
} from '@nestjs/common';

import { RawStockDto }
    from '../dto/raw-stock.dto';

@Injectable()
export class AjaibStockScraper {

    private readonly logger =
        new Logger(
            AjaibStockScraper.name,
        );

    async scrape():
        Promise<RawStockDto[]> {
        this.logger.log(
            'Ajaib scraper is disabled. Data is now sourced from EMITEN_API_URL.',
        );

        return [];
    }

}
