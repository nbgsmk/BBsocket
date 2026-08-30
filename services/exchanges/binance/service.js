const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const ExchangeService = require('../exchange-service');
const CandleHistory = require('../../market-data/candle-history');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'config', 'binancesocket.json');
const INTERVALS = new Set(['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);

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

class BinanceSocket extends ExchangeService {
  constructor(options = {}) {
    super();
    this.configPath = options.configPath || CONFIG_PATH;
    this.config = readConfig(this.configPath);
    this.WebSocket = options.WebSocket || WebSocket;
    this.socket = null;
    this.history = new CandleHistory(this.config.historyCandles, this.config.subscriptionInterval, this.config.tickerSymbols.map(publicSymbol));
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
    if (!this.history.histories[symbol]) return;
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
    this.history.add(candle);
  }

  candles(symbol, limit) {
    return this.history.candles(symbol, limit);
  }

  aggregateCandles(symbol, aggregation) {
    if (!INTERVALS.has(aggregation)) {
      throw new Error('Aggregation must be a fixed Binance interval other than 1M');
    }
    return this.history.aggregate(symbol, aggregation);
  }

  status() {
    return {
      connected: this.config.connected,
      socketOpen: Boolean(this.socket && this.socket.readyState === this.WebSocket.OPEN),
      tickerSymbols: this.config.tickerSymbols,
      webSocketUrl: this.streamUrl(),
	  subscriptionInterval: this.config.subscriptionInterval,
	  historyCandles: this.config.historyCandles,
      candles: this.history.counts()
    };
  }

  subscribe(listener) {
    return super.subscribe(listener);
  }
}

module.exports = { BinanceSocket, readConfig, writeConfig, CONFIG_PATH };
