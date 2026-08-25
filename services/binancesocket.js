const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const WebSocket = require('ws');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'binancesocket.json');
const INTERVALS = new Set(['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);

function readConfig(configPath = CONFIG_PATH) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!/^[A-Z0-9]+_(PERPETUAL|CURRENT_QUARTER|NEXT_QUARTER)$/.test(config.tickerSymbol)) {
    throw new Error('tickerSymbol must be a Coin-M continuous contract, e.g. BTCUSD_PERPETUAL');
  }
  if (!Number.isInteger(config.historyLength) || config.historyLength < 1) {
    throw new Error('historyLength must be a positive integer');
  }
  if (!INTERVALS.has(config.interval)) {
    throw new Error('Unsupported Binance interval: ' + config.interval);
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
    this.history = [];
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
  }

  streamUrl() {
    const stream = symbolForStream(this.config.tickerSymbol) + '@continuousKline_' + this.config.interval;
    return 'wss://dstream.binance.com/ws/' + stream;
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
    const kline = message.k;
    if (!kline || kline.x !== true) return;
    const candle = {
      symbol: publicSymbol(this.config.tickerSymbol),
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
    const existing = this.history.findIndex(item => item.openTime === candle.openTime);
    if (existing >= 0) this.history[existing] = candle;
    else this.history.push(candle);
    this.history.sort((a, b) => a.openTime - b.openTime);
    const cutoff = Date.now() - this.config.historyLength * 60 * 1000;
    this.history = this.history.filter(item => item.openTime >= cutoff);
  }

  candles(limit) {
    const result = this.history.slice().sort((a, b) => a.openTime - b.openTime);
    return Number.isInteger(limit) && limit > 0 ? result.slice(-limit) : result;
  }

  status() {
    return {
      connected: this.config.connected,
      socketOpen: Boolean(this.socket && this.socket.readyState === this.WebSocket.OPEN),
      tickerSymbol: this.config.tickerSymbol,
      webSocketUrl: this.streamUrl(),
      interval: this.config.interval,
      historyLength: this.config.historyLength,
      candles: this.history.length
    };
  }

  subscribe(listener) {
    this.on('message', listener);
    return () => this.removeListener('message', listener);
  }
}

module.exports = { BinanceSocket, readConfig, writeConfig, CONFIG_PATH };
