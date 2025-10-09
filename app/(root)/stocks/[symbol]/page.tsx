import TradingViewWidget from '@/components/TradingViewWidget';
import {
  SYMBOL_INFO_WIDGET_CONFIG,
  CANDLE_CHART_WIDGET_CONFIG,
  BASELINE_WIDGET_CONFIG,
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
} from '@/lib/constants';
import WatchlistButton from '@/components/WatchlistButton';

const StockDetails = async ({ params }: StockDetailsPageProps) => {
  const { symbol } = await params;
  const scriptBase = 'https://s3.tradingview.com/external-embedding/embed-widget-';

  return (
    <div className="min-h-screen w-full grid grid-cols-1 xl:grid-cols-2 gap-8 p-4">
      <section className="space-y-6">
        <TradingViewWidget
          scriptUrl={`${scriptBase}symbol-info.js`}
          config={SYMBOL_INFO_WIDGET_CONFIG(symbol)}
          height={170}
        />
        <TradingViewWidget
          scriptUrl={`${scriptBase}advanced-chart.js`}
          config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
          height={600}
        />
        <TradingViewWidget
          scriptUrl={`${scriptBase}advanced-chart.js`}
          config={BASELINE_WIDGET_CONFIG(symbol)}
          height={600}
        />
      </section>

      <section className="space-y-6">
        <div className="flex justify-end">
          <WatchlistButton symbol={symbol.toUpperCase()} company={symbol.toUpperCase()} isInWatchlist={false} />
        </div>
        <TradingViewWidget
          scriptUrl={`${scriptBase}technical-analysis.js`}
          config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(symbol)}
          height={400}
        />
        <TradingViewWidget
          scriptUrl={`${scriptBase}company-profile.js`}
          config={COMPANY_PROFILE_WIDGET_CONFIG(symbol)}
          height={440}
        />
        <TradingViewWidget
          scriptUrl={`${scriptBase}financials.js`}
          config={COMPANY_FINANCIALS_WIDGET_CONFIG(symbol)}
          height={464}
        />
      </section>
    </div>
  );
}

export default StockDetails;