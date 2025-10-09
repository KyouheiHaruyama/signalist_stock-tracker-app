'use server';

import {cache} from "react";
import {POPULAR_STOCK_SYMBOLS} from "@/lib/constants";

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';

type FinnhubArticle = {
  id?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  datetime?: number;
  category?: string;
  related?: string;
  image?: string;
};

export async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const init: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
    ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
    : { cache: 'no-store' };

  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

const formatDate = (d: Date) => d.toISOString().slice(0, 10);

const isValidArticle = (
  a: FinnhubArticle | MarketNewsArticle | undefined
): a is MarketNewsArticle => {
  if (!a) return false;
  const hasId = typeof (a as { id?: number }).id === 'number';
  const hasKey = hasId || !!a.url || !!a.headline;
  const hasDatetime = typeof a.datetime === 'number' && !isNaN(a.datetime);
  return hasKey && hasDatetime;
};

const uniqueKey = (a: FinnhubArticle | MarketNewsArticle): string => {
  const idVal = (a as { id?: number }).id;
  if (typeof idVal === 'number' && idVal > 0) return String(idVal);
  if (a.url) return a.url;
  if (a.headline) return a.headline;
  // 予備のキー（衝突しづらい値で代替）
  return `${a.datetime ?? '0'}-${a.source ?? 'unknown'}`;
};

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
  try {
    if (!NEXT_PUBLIC_FINNHUB_API_KEY) {
      throw new Error('Missing FINNHUB API key');
    }

    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 5);

    const fromStr = formatDate(from);
    const toStr = formatDate(now);

    // 記事の整形
    const normalize = (a: FinnhubArticle): MarketNewsArticle | undefined => {
      const normalized: MarketNewsArticle = {
        id: a.id ?? 0,
        headline: a.headline ?? '',
        summary: a.summary ?? '',
        source: a.source ?? '',
        url: a.url ?? '',
        datetime: a.datetime ?? 0,
        category: a.category ?? '',
        related: a.related ?? '',
        image: a.image,
      };
      return isValidArticle(normalized) ? normalized : undefined;
    };

    const dedupe = (list: (MarketNewsArticle | undefined)[]) => {
      const seen = new Set<string>();
      const res: MarketNewsArticle[] = [];
      for (const item of list) {
        if (!item) continue;
        const key = uniqueKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        res.push(item);
      }
      return res;
    };

    const MAX_ARTICLES = 6;

    // シンボルが指定されている場合：各シンボルのニュースを事前に取得してラウンドロビンで選択
    const cleanSymbols =
      symbols?.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0) ?? [];

    if (cleanSymbols.length > 0) {
      // 事前フェッチ（各シンボル一回）
      const perSymbolNews = new Map<string, MarketNewsArticle[]>();
      for (const sym of cleanSymbols) {
        const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(
          sym
        )}&from=${fromStr}&to=${toStr}&token=${encodeURIComponent(NEXT_PUBLIC_FINNHUB_API_KEY)}`;
        const raw = await fetchJSON<FinnhubArticle[]>(url, 600);
        const normalized = raw.map(normalize).filter(Boolean) as MarketNewsArticle[];
        // 新しい順に
        normalized.sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));
        perSymbolNews.set(sym, normalized);
      }

      const picked: MarketNewsArticle[] = [];
      const seen = new Set<string>();

      for (let round = 0; round < MAX_ARTICLES; round++) {
        const sym = cleanSymbols[round % cleanSymbols.length];
        const list = perSymbolNews.get(sym) ?? [];
        // まだ選ばれていない記事を1件選択
        let chosen: MarketNewsArticle | undefined;
        while (list.length > 0 && !chosen) {
          const candidate = list.shift();
          if (!candidate) break;
          const key = uniqueKey(candidate);
          if (seen.has(key) || !isValidArticle(candidate)) continue;
          chosen = candidate;
          seen.add(key);
        }
        if (chosen) picked.push(chosen);
      }

      if (picked.length > 0) {
        // 全体を新しい順に
        picked.sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));
        return picked.slice(0, MAX_ARTICLES);
      }
      // ウォッチリストがあっても記事がゼロなら一般ニュースへフォールバック
    }

    // 一般ニュース（フォールバックまたはウォッチリストなし）
    const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${encodeURIComponent(
      NEXT_PUBLIC_FINNHUB_API_KEY
    )}`;
    const generalRaw = await fetchJSON<FinnhubArticle[]>(generalUrl, 300);
    const general = dedupe(generalRaw.map(normalize)).filter(isValidArticle);

    // 新しい順にソートして最大6件
    general.sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));
    return general.slice(0, MAX_ARTICLES);
  } catch (error) {
    console.error('Failed to fetch news:', error);
    throw new Error('Failed to fetch news');
  }
}

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
    try {
        const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) {
            // If no token, log and return empty to avoid throwing per requirements
            console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
            return [];
        }

        const trimmed = typeof query === 'string' ? query.trim() : '';

        let results: FinnhubSearchResult[] = [];

        if (!trimmed) {
            // Fetch top 10 popular symbols' profiles
            const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
            const profiles = await Promise.all(
                top.map(async (sym) => {
                    try {
                        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
                        // Revalidate every hour
                        const profile = await fetchJSON<any>(url, 3600);
                        return { sym, profile } as { sym: string; profile: any };
                    } catch (e) {
                        console.error('Error fetching profile2 for', sym, e);
                        return { sym, profile: null } as { sym: string; profile: any };
                    }
                })
            );

            results = profiles
                .map(({ sym, profile }) => {
                    const symbol = sym.toUpperCase();
                    const name: string | undefined = profile?.name || profile?.ticker || undefined;
                    const exchange: string | undefined = profile?.exchange || undefined;
                    if (!name) return undefined;
                    const r: FinnhubSearchResult = {
                        symbol,
                        description: name,
                        displaySymbol: symbol,
                        type: 'Common Stock',
                    };
                    // We don't include exchange in FinnhubSearchResult type, so carry via mapping later using profile
                    // To keep pipeline simple, attach exchange via closure map stage
                    // We'll reconstruct exchange when mapping to final type
                    (r as any).__exchange = exchange; // internal only
                    return r;
                })
                .filter((x): x is FinnhubSearchResult => Boolean(x));
        } else {
            const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
            const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
            results = Array.isArray(data?.result) ? data.result : [];
        }

        const mapped: StockWithWatchlistStatus[] = results
            .map((r) => {
                const upper = (r.symbol || '').toUpperCase();
                const name = r.description || upper;
                const exchangeFromDisplay = (r.displaySymbol as string | undefined) || undefined;
                const exchangeFromProfile = (r as any).__exchange as string | undefined;
                const exchange = exchangeFromDisplay || exchangeFromProfile || 'US';
                const type = r.type || 'Stock';
                const item: StockWithWatchlistStatus = {
                    symbol: upper,
                    name,
                    exchange,
                    type,
                    isInWatchlist: false,
                };
                return item;
            })
            .slice(0, 15);

        return mapped;
    } catch (err) {
        console.error('Error in stock search:', err);
        return [];
    }
});
