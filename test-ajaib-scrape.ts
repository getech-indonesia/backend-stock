import axios from 'axios';

type AjaibStockItem = {
    code: string;
    name: string;
    price: number;
    icon_url?: string;
    market_cap?: number;
    volume?: number;
};

type AjaibResponse = {
    err_code: string;
    err_message: string;
    result: {
        count: number;
        next: string | null;
        results: AjaibStockItem[];
    };
};

const AJAIB_HOME_URL =
    'https://ajaib.co.id/';
const AJAIB_LIST_URL =
    'https://ajaib.co.id/api/stock-list';

async function warmupCookies():
    Promise<string> {
    try {
        const response =
            await axios.get(
                AJAIB_HOME_URL,
                {
                    timeout: 20000,
                    headers: {
                        Accept:
                            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language':
                            'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Cache-Control':
                            'no-cache',
                        Pragma:
                            'no-cache',
                        'Upgrade-Insecure-Requests':
                            '1',
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
                    },
                },
            );

        const setCookie =
            response.headers[
                'set-cookie'
            ] ?? [];

        return (
            Array.isArray(
                setCookie,
            )
                ? setCookie
                : [setCookie]
        )
            .map(
                (cookieLine) =>
                    cookieLine.split(
                        ';',
                    )[0],
            )
            .filter(Boolean)
            .join('; ');
    } catch {
        return '';
    }
}

async function run() {
    console.log(
        'Starting Ajaib scrape test (page 1 only)...',
    );

    const warmupCookie =
        await warmupCookies();
    const manualCookie =
        process.env.AJAIB_COOKIE ??
        '';
    const mergedCookie =
        [warmupCookie, manualCookie]
            .filter(Boolean)
            .join('; ');

    const response =
        await axios.get<AjaibResponse>(
            AJAIB_LIST_URL,
            {
                timeout: 30000,
                params: {
                    page: 1,
                    page_size: 20,
                    sort_type:
                        'MARKET_CAP',
                    sort_direction:
                        'DESC',
                },
                headers: {
                    Accept:
                        'application/json, text/plain, */*',
                    'Accept-Language':
                        'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    Referer:
                        'https://ajaib.co.id/',
                    Origin:
                        'https://ajaib.co.id',
                    'Cache-Control':
                        'no-cache',
                    Pragma:
                        'no-cache',
                    'Sec-Fetch-Dest':
                        'empty',
                    'Sec-Fetch-Mode':
                        'cors',
                    'Sec-Fetch-Site':
                        'same-origin',
                    'sec-ch-ua':
                        '"Chromium";v="136", "Not.A/Brand";v="8", "Google Chrome";v="136"',
                    'sec-ch-ua-mobile':
                        '?0',
                    'sec-ch-ua-platform':
                        '"Windows"',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
                    ...(mergedCookie
                        ? {
                            Cookie:
                                mergedCookie,
                        }
                        : {}),
                },
            },
        );

    const result =
        response.data.result;

    console.log(
        `Success. total=${result.count}, page1=${result.results.length}, next=${result.next}`,
    );
    console.log(
        'Sample (first 5):',
    );
    console.log(
        JSON.stringify(
            result.results.slice(
                0,
                5,
            ),
            null,
            2,
        ),
    );
}

run().catch((error) => {
    const status =
        error?.response?.status;
    const rawData =
        error?.response?.data;
    const body =
        typeof rawData ===
            'string'
            ? rawData.slice(0, 300)
            : rawData
                ? JSON.stringify(
                    rawData,
                ).slice(0, 300)
                : 'N/A';
    const message =
        error instanceof Error
            ? error.message
            : String(error);

    console.error(
        `Ajaib test failed. status=${status ?? 'N/A'} message=${message}`,
    );
    console.error(
        `body=${body ?? 'N/A'}`,
    );
    process.exit(1);
});
