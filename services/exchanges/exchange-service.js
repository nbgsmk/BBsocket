const EventEmitter = require('events');

/**
 * Common contract for exchange market-data services.
 * Exchange implementations provide the connection, status, and candle methods;
 * the event subscription behavior is shared by all implementations.
 */
class ExchangeService extends EventEmitter {
  connect() {
    throw new Error('Exchange service must implement connect()');
  }

  disconnect() {
    throw new Error('Exchange service must implement disconnect()');
  }

  status() {
    throw new Error('Exchange service must implement status()');
  }

  candles(symbol, options) { // eslint-disable-line no-unused-vars
    throw new Error('Exchange service must implement candles()');
  }

  subscribe(listener) {
    this.on('message', listener);
    return () => this.removeListener('message', listener);
  }
}

module.exports = ExchangeService;
