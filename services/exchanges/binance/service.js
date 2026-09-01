const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const ExchangeService = require('../exchange-service');
const CandleHistory = require('../../market-data/candle-history');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'config', 'binancesocket.json');
const INTERVALS = new Set(['1s', '1m', '2m', '3m', '5m', '10m', '15m', '20m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '2d', '3d', '4d', '5d', '1w', '1M']);
const MARKET_TYPES = new Set(['coin-m', 'usd-m']);

function configSection(marketType) {
  return marketType === 'usd-m' ? 'usdM' : 'coinM';
}

function readConfig(configPath = CONFIG_PATH, marketType = 'coin-m') {
  if (!MARKET_TYPES.has(marketType)) throw new Error('Unsupported Binance market type: ' + marketType);
  const rootConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const config = rootConfig[configSection(marketType)];
  if (!config || !Array.isArray(config.tickerSymbols) || config.tickerSymbols.length < 1) {
    throw new Error(configSection(marketType) + '.tickerSymbols must contain at least one symbol');
  }
  if (marketType === 'coin-m' && config.tickerSymbols.some(symbol => !/^[A-Z0-9]+_(PERPETUAL|CURRENT_QUARTER|NEXT_QUARTER)$/.test(symbol))) {
    throw new Error('coinM.tickerSymbols must contain Coin-M continuous contracts, e.g. BTCUSD_PERPETUAL');
  }
  if (marketType === 'usd-m' && config.tickerSymbols.some(symbol => !/^[A-Z0-9]+$/.test(symbol))) {
    throw new Error('usdM.tickerSymbols must contain USD-M symbols, e.g. BTCUSDT');
  }
  if (new Set(config.tickerSymbols).size !== config.tickerSymbols.length) throw new Error('tickerSymbols must be unique');
  if (typeof config.host !== 'string' || !config.host.trim()) {
    throw new Error(configSection(marketType) + '.host must be a non-empty hostname');
  }
  config.host = config.host.trim().toLowerCase();
  if (!Number.isInteger(config.historyCandles) || config.historyCandles < 1) {
    throw new Error('historyCandles must be a positive integer');
  }
  if (!INTERVALS.has(config.exchangeCandlestickStreamInterval)) {
    throw new Error('Unsupported Binance interval: ' + config.exchangeCandlestickStreamInterval);
  }
  config.initiallyConnected = config.initiallyConnected === true;
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
  return tickerSymbol.includes('_') ? tickerSymbol.split('_')[0].toLowerCase() : tickerSymbol.toLowerCase();
}

class BinanceSocket extends ExchangeService {
  constructor(options = {}) {
    super();
    this.marketType = options.marketType || 'coin-m';
    if (!MARKET_TYPES.has(this.marketType)) throw new Error('Unsupported Binance market type: ' + this.marketType);
    this.configPath = options.configPath || CONFIG_PATH;
    this.config = readConfig(this.configPath, this.marketType);
    this.WebSocket = options.WebSocket || WebSocket;
    this.socket = null;
    this.history = new CandleHistory(this.config.historyCandles, this.config.exchangeCandlestickStreamInterval, this.config.tickerSymbols.map(symbolForStream));
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
  }

  streamUrl() {
    const streamName = this.marketType === 'coin-m' ? 'continuousKline' : 'kline';
    const streams = this.config.tickerSymbols.map(symbol => symbolForStream(symbol) + '@' + streamName + '_' + this.config.exchangeCandlestickStreamInterval);
    return 'wss://' + this.config.host + '/stream?streams=' + streams.join('/');
  }

  connect() {
    if (this.socket && (this.socket.readyState === this.WebSocket.OPEN || this.socket.readyState === this.WebSocket.CONNECTING)) {
      return;
    }
    this.config = readConfig(this.configPath, this.marketType);
    this.config.initiallyConnected = true;
    this.persistConfig();
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
      if (this.config.initiallyConnected) this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config.initiallyConnected) this.openSocket();
    }, delay);
  }

  disconnect() {
    this.config = readConfig(this.configPath, this.marketType);
    this.config.initiallyConnected = false;
    this.persistConfig();
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

  persistConfig() {
    const rootConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    rootConfig[configSection(this.marketType)] = this.config;
    writeConfig(rootConfig, this.configPath);
  }

  handleMessage(rawMessage) {
    let message;
    try { message = JSON.parse(rawMessage.toString()); } catch (_) { return; }
    this.emit('message', { raw: rawMessage.toString(), parsed: message });
    const kline = message.data ? message.data.k : message.k;
    if (!kline) return;
    const instrument = (kline.s || (message.stream || '').split('@')[0]).toLowerCase();
    if (!this.history.histories[instrument]) return;
    const candle = {
      symbol: publicSymbol(instrument),
      instrument,
      interval: kline.i,
      openTime: kline.t,
      closeTime: kline.T,
      open: kline.o,
      high: kline.h,
      low: kline.l,
      close: kline.c,
      volume: kline.v,
      quoteVolume: kline.q,
      trades: kline.n,
      candlestickIsClosed: kline.x === true
    };
    this.history.update(candle);
  }

  candles(symbol, limit) {
    return this.history.candles(symbol, limit);
  }

  aggregateCandles(symbol, aggregation, includeIncomplete = false) {
    if (!INTERVALS.has(aggregation)) {
      throw new Error('Aggregation must be a fixed Binance interval other than 1M');
    }
    return this.history.aggregate(symbol, aggregation, includeIncomplete);
  }

  status() {
    return {
      connected: this.config.initiallyConnected,
      marketType: this.marketType,
      socketOpen: Boolean(this.socket && this.socket.readyState === this.WebSocket.OPEN),
      tickerSymbols: this.config.tickerSymbols,
      webSocketUrl: this.streamUrl(),
	  exchangeCandlestickStreamInterval: this.config.exchangeCandlestickStreamInterval,
	  historyCandles: this.config.historyCandles,
      candles: this.history.counts()
    };
  }

  subscribe(listener) {
    return super.subscribe(listener);
  }

  subscribeCandles(listener) {
    return this.history.subscribe(listener);
  }
}

module.exports = { BinanceSocket, readConfig, writeConfig, CONFIG_PATH };
