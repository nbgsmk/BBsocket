const EventEmitter = require('events');
const INTERVAL_MS = new Map([
  ['1s', 1000], ['1m', 60000], ['3m', 180000], ['5m', 300000], ['15m', 900000], ['30m', 1800000],
  ['1h', 3600000], ['2h', 7200000], ['4h', 14400000], ['6h', 21600000], ['8h', 28800000],
  ['12h', 43200000], ['1d', 86400000], ['3d', 259200000], ['1w', 604800000]
]);

class CandleHistory extends EventEmitter {
  constructor(maxCandles, sourceInterval, symbols = []) {
    super();
    this.maxCandles = maxCandles;
    this.sourceInterval = sourceInterval;
    this.histories = {};
    this.current = {};
    symbols.forEach(symbol => this.ensureSymbol(symbol));
  }

  ensureSymbol(symbol) {
    if (!this.histories[symbol]) this.histories[symbol] = [];
  }

  add(candle) {
    this.ensureSymbol(candle.symbol);
    const history = this.histories[candle.symbol];
    const existing = history.findIndex(item => item.openTime === candle.openTime);
    if (existing >= 0) history[existing] = candle;
    else history.push(candle);
    history.sort((a, b) => a.openTime - b.openTime);
    if (history.length > this.maxCandles) this.histories[candle.symbol] = history.slice(-this.maxCandles);
  }

  update(candle) {
    if (candle.closed) {
      delete this.current[candle.symbol];
      this.add(candle);
    } else {
      this.ensureSymbol(candle.symbol);
      this.current[candle.symbol] = candle;
    }
    this.emit('candle', candle);
  }

  candles(symbol, limit) {
    const result = (this.histories[symbol] || []).slice().sort((a, b) => a.openTime - b.openTime);
    return Number.isInteger(limit) && limit > 0 ? result.slice(-limit) : result;
  }

  aggregate(symbol, aggregation, includeIncomplete = false) {
    const sourceMs = INTERVAL_MS.get(this.sourceInterval);
    const targetMs = INTERVAL_MS.get(aggregation);
    if (!targetMs) throw new Error('Aggregation must be a fixed interval other than 1M');
    if (!sourceMs || targetMs < sourceMs || targetMs % sourceMs !== 0) {
      throw new Error('Aggregation must be equal to or a multiple of subscriptionInterval');
    }
    const sourceCandles = this.candles(symbol);
    if (includeIncomplete && this.current[symbol]) sourceCandles.push(this.current[symbol]);
    if (targetMs === sourceMs) {
      return includeIncomplete && this.current[symbol]
        ? sourceCandles.sort((a, b) => a.openTime - b.openTime)
        : sourceCandles;
    }

    const groups = new Map();
    for (const candle of sourceCandles) {
      const bucket = Math.floor(candle.openTime / targetMs) * targetMs;
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket).push(candle);
    }

    const expected = targetMs / sourceMs;
    return Array.from(groups.entries()).reduce((result, [openTime, group]) => {
      group.sort((a, b) => a.openTime - b.openTime);
      const contiguous = !group.some((candle, index) => index > 0 && candle.openTime !== group[index - 1].openTime + sourceMs);
      const complete = group.length === expected && contiguous;
      const incomplete = includeIncomplete && this.current[symbol] && group.some(candle => candle.openTime === this.current[symbol].openTime) && contiguous && openTime + targetMs > Date.now();
      if ((!complete && !incomplete) || (complete && openTime + targetMs > Date.now())) return result;
      result.push({
        symbol,
        interval: aggregation,
        closed: complete,
        openTime,
        closeTime: openTime + targetMs - 1,
        open: group[0].open,
        high: String(Math.max(...group.map(candle => Number(candle.high)))),
        low: String(Math.min(...group.map(candle => Number(candle.low)))),
        close: group[group.length - 1].close,
        volume: String(group.reduce((sum, candle) => sum + Number(candle.volume), 0)),
        quoteVolume: String(group.reduce((sum, candle) => sum + Number(candle.quoteVolume), 0)),
        trades: group.reduce((sum, candle) => sum + Number(candle.trades), 0)
      });
      return result;
    }, []);
  }

  counts() {
    return Object.fromEntries(Object.entries(this.histories).map(([symbol, history]) => [symbol, history.length]));
  }

  subscribe(listener) {
    this.on('candle', listener);
    return () => this.removeListener('candle', listener);
  }
}

module.exports = CandleHistory;
