const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const WebSocket = require('ws');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'binancesocket.json');
const INTERVALS = new Set(['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);
const INTERVAL_MS = new Map([
  ['1s', 1000], ['1m', 60000], ['3m', 180000], ['5m', 300000], ['15m', 900000], ['30m', 1800000],
  ['1h', 3600000], ['2h', 7200000], ['4h', 14400000], ['6h', 21600000], ['8h', 28800000],
  ['12h', 43200000], ['1d', 86400000], ['3d', 259200000], ['1w', 604800000]
]);

function readConfig(configPath = CONFIG_PATH) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Array.isArray(config.tickerSymbols) || config.tickerSymbols.length < 1 || config.tickerSymbols.some(symbol => !/^[A-Z0-9]+_(PERPETUAL|CURRENT_QUARTER|NEXT_QUARTER)$/.test(symbol))) {
    throw new Error('tickerSymbols must contain Coin-M continuous contracts, e.g. BTCUSD_PERPETUAL');
  }
  if (new Set(config.tickerSymbols).size !== config.tickerSymbols.length) throw new Error('tickerSymbols must be unique');
  if (!Number.isInteger(config.historyCandles) || config.historyCandles < 1) {
    throw new Error('historyCandles must be a positive integer');
  }
  if (!INTERVALS.has(config.subscriptionInterval)) {
    throw new Error('Unsupported Binance interval: ' + config.subscriptionInterval);
  }
  config.connected = config.connected === true;
  return config;
}

function writeConfig(config, configPath = CONFIG_PATH) {
  const temporaryPath = configPath + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(temporaryPath, configPath);
}

function symbolForStream(tickerSymbol) {
  return tickerSymbol.toLowerCase();
}

function publicSymbol(tickerSymbol) {
  return tickerSymbol.split('_')[0].toLowerCase();
}

class BinanceSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configPath = options.configPath || CONFIG_PATH;
    this.config = readConfig(this.configPath);
    this.WebSocket = options.WebSocket || WebSocket;
    this.socket = null;
    this.histories = {};
    this.config.tickerSymbols.forEach(symbol => { this.histories[publicSymbol(symbol)] = []; });
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
  }

  streamUrl() {
    const streams = this.config.tickerSymbols.map(symbol => symbolForStream(symbol) + '@continuousKline_' + this.config.subscriptionInterval);
    return 'wss://dstream.binance.com/stream?streams=' + streams.join('/');
  }

  connect() {
    if (this.socket && (this.socket.readyState === this.WebSocket.OPEN || this.socket.readyState === this.WebSocket.CONNECTING)) {
      return;
    }
    this.config = readConfig(this.configPath);
    this.config.connected = true;
    writeConfig(this.config, this.configPath);
    this.openSocket();
  }

  openSocket() {
    const socket = new this.WebSocket(this.streamUrl());
    this.socket = socket;
    socket.on('open', () => { this.reconnectDelay = 1000; });
    socket.on('message', data => this.handleMessage(data));
    socket.on('error', error => console.error('Binance WebSocket error:', error.message));
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      if (this.config.connected) this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config.connected) this.openSocket();
    }, delay);
  }

  disconnect() {
    this.config = readConfig(this.configPath);
    this.config.connected = false;
    writeConfig(this.config, this.configPath);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close();
    }
  }

  handleMessage(rawMessage) {
    let message;
    try { message = JSON.parse(rawMessage.toString()); } catch (_) { return; }
    this.emit('message', { raw: rawMessage.toString(), parsed: message });
    const kline = message.data ? message.data.k : message.k;
    if (!kline || kline.x !== true) return;
    const symbol = publicSymbol(kline.s || (message.stream || '').split('@')[0]);
    if (!this.histories[symbol]) return;
    const candle = {
      symbol,
      interval: kline.i,
      openTime: kline.t,
      closeTime: kline.T,
      open: kline.o,
      high: kline.h,
      low: kline.l,
      close: kline.c,
      volume: kline.v,
      quoteVolume: kline.q,
      trades: kline.n
    };
    const history = this.histories[symbol];
    const existing = history.findIndex(item => item.openTime === candle.openTime);
    if (existing >= 0) history[existing] = candle;
    else history.push(candle);
    history.sort((a, b) => a.openTime - b.openTime);
    if (history.length > this.config.historyCandles) {
      this.histories[symbol] = history.slice(-this.config.historyCandles);
    }
  }

  candles(symbol, limit) {
    const result = (this.histories[symbol] || []).slice().sort((a, b) => a.openTime - b.openTime);
    return Number.isInteger(limit) && limit > 0 ? result.slice(-limit) : result;
  }

  aggregateCandles(symbol, aggregation) {
    if (!INTERVALS.has(aggregation) || !INTERVAL_MS.has(aggregation)) {
      throw new Error('Aggregation must be a fixed Binance interval other than 1M');
    }
    const sourceInterval = this.config.subscriptionInterval;
    const sourceMs = INTERVAL_MS.get(sourceInterval);
    const targetMs = INTERVAL_MS.get(aggregation);
    if (!sourceMs || targetMs < sourceMs || targetMs % sourceMs !== 0) {
      throw new Error('Aggregation must be equal to or a multiple of subscriptionInterval');
    }
    if (targetMs === sourceMs) return this.candles(symbol);

    const groups = new Map();
    for (const candle of this.candles(symbol)) {
      const bucket = Math.floor(candle.openTime / targetMs) * targetMs;
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket).push(candle);
    }

    const aggregated = [];
    const expected = targetMs / sourceMs;
    for (const [openTime, group] of groups) {
      group.sort((a, b) => a.openTime - b.openTime);
      if (group.length !== expected || group.some((candle, index) => index > 0 && candle.openTime !== group[index - 1].openTime + sourceMs)) continue;
      if (openTime + targetMs > Date.now()) continue;
      aggregated.push({
        symbol,
        interval: aggregation,
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
    }
    return aggregated;
  }

  status() {
    return {
      connected: this.config.connected,
      socketOpen: Boolean(this.socket && this.socket.readyState === this.WebSocket.OPEN),
      tickerSymbols: this.config.tickerSymbols,
      webSocketUrl: this.streamUrl(),
	  subscriptionInterval: this.config.subscriptionInterval,
	  historyCandles: this.config.historyCandles,
      candles: Object.fromEntries(Object.entries(this.histories).map(([symbol, history]) => [symbol, history.length]))
    };
  }

  subscribe(listener) {
    this.on('message', listener);
    return () => this.removeListener('message', listener);
  }
}

module.exports = { BinanceSocket, readConfig, writeConfig, CONFIG_PATH };
