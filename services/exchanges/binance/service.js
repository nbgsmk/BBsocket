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
  config.tickerSymbols = config.tickerSymbols.map(symbol => typeof symbol === 'string' ? symbol.trim().toUpperCase() : symbol);
  if (marketType === 'coin-m' && config.tickerSymbols.some(symbol => typeof symbol !== 'string' || !/^[A-Z0-9]+_(PERPETUAL|CURRENT_QUARTER|NEXT_QUARTER)$/.test(symbol))) {
    throw new Error('coinM.tickerSymbols must contain Coin-M continuous contracts, e.g. BTCUSD_PERPETUAL');
  }
  if (marketType === 'usd-m' && config.tickerSymbols.some(symbol => typeof symbol !== 'string' || !/^[A-Z0-9]+$/.test(symbol))) {
    throw new Error('usdM.tickerSymbols must contain USD-M symbols, e.g. BTCUSDT');
  }
  if (new Set(config.tickerSymbols).size !== config.tickerSymbols.length) throw new Error('tickerSymbols must be unique');
  if (typeof config.host !== 'string' || !config.host.trim()) {
    throw new Error(configSection(marketType) + '.host must be a non-empty hostname');
  }
  config.host = config.host.trim().toLowerCase();
  if (!Number.isInteger(config.maxCandlesticksInMemory) || config.maxCandlesticksInMemory < 1) {
    throw new Error('maxCandlesticksInMemory must be a positive integer');
  }
  if (typeof config.fetchHistoryOnStart === 'string') {
    const fetchHistory = config.fetchHistoryOnStart.trim().toLowerCase();
    if (fetchHistory !== 'true' && fetchHistory !== 'false') {
      throw new Error(configSection(marketType) + '.fetchHistoryOnStart must be true or false');
    }
    config.fetchHistoryOnStart = fetchHistory === 'true';
  } else if (config.fetchHistoryOnStart === undefined) {
    config.fetchHistoryOnStart = false;
  } else if (typeof config.fetchHistoryOnStart !== 'boolean') {
    throw new Error(configSection(marketType) + '.fetchHistoryOnStart must be true or false');
  }
  if (!INTERVALS.has(config.exchangeCandlestickStreamInterval)) {
    throw new Error('Unsupported Binance interval: ' + config.exchangeCandlestickStreamInterval);
  }
  if (typeof config.initiallyConnected === 'string') {
    const connectionState = config.initiallyConnected.trim().toLowerCase();
    if (connectionState !== 'true' && connectionState !== 'false') {
      throw new Error(configSection(marketType) + '.initiallyConnected must be true or false');
    }
    config.initiallyConnected = connectionState === 'true';
  } else {
    config.initiallyConnected = config.initiallyConnected === true;
  }
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
    this.fetch = options.fetch || global.fetch;
    if (typeof this.fetch !== 'function') throw new Error('A fetch implementation is required');
    this.socket = null;
    this.history = new CandleHistory(this.config.maxCandlesticksInMemory, this.config.exchangeCandlestickStreamInterval, this.config.tickerSymbols.map(symbolForStream));
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.initializationPromise = null;
  }

  restUrl() {
    return 'https://' + (this.marketType === 'coin-m' ? 'dapi.binance.com/dapi/v1/continuousKlines' : 'fapi.binance.com/fapi/v1/klines');
  }

  restParameters(symbol, endTime, limit) {
    const parameters = new URLSearchParams({ interval: this.config.exchangeCandlestickStreamInterval, limit: String(limit), endTime: String(endTime) });
    if (this.marketType === 'coin-m') {
      const [pair, contractType] = symbol.split('_');
      parameters.set('pair', pair);
      parameters.set('contractType', contractType);
    } else {
      parameters.set('symbol', symbol);
    }
    return parameters;
  }

  normalizeRestCandle(row, instrument) {
    return {
      symbol: publicSymbol(instrument), instrument, interval: this.config.exchangeCandlestickStreamInterval,
      openTime: row[0], closeTime: row[6], open: row[1], high: row[2], low: row[3], close: row[4],
      volume: row[5], quoteVolume: row[7], trades: row[8], candlestickIsClosed: true
    };
  }

  async fetchHistoryForSymbol(tickerSymbol) {
    const instrument = symbolForStream(tickerSymbol);
    const candles = [];
    let endTime = Date.now();
    while (candles.length < this.config.maxCandlesticksInMemory) {
      const limit = Math.min(1500, this.config.maxCandlesticksInMemory - candles.length);
      const url = this.restUrl() + '?' + this.restParameters(tickerSymbol, endTime, limit);
      const response = await this.fetch(url);
      if (!response.ok) throw new Error('Binance history request failed with HTTP ' + response.status);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      const completed = rows.filter(row => Array.isArray(row) && row.length >= 9 && Number(row[6]) < Date.now());
      candles.unshift(...completed.map(row => this.normalizeRestCandle(row, instrument)));
      if (rows.length < limit || Number(rows[0][0]) <= 0) break;
      endTime = Number(rows[0][0]) - 1;
    }
    candles.sort((a, b) => a.openTime - b.openTime);
    candles.slice(-this.config.maxCandlesticksInMemory).forEach(candle => this.history.update(candle));
  }

  async fetchHistory() {
    for (const symbol of this.config.tickerSymbols) {
      try {
        await this.fetchHistoryForSymbol(symbol);
      } catch (error) {
        console.error('Binance history fetch failed for ' + symbol + ':', error.message);
      }
    }
  }

  initialize() {
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = (async () => {
      if (this.config.fetchHistoryOnStart) {
        await this.fetchHistory();
      }
      if (this.config.initiallyConnected) this.connect();
    })();
    return this.initializationPromise;
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
	  maxCandlesticksInMemory: this.config.maxCandlesticksInMemory,
      fetchHistoryOnStart: this.config.fetchHistoryOnStart,
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
