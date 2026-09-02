class PaperBroker {
  constructor() {
    this.positions = new Map();
    this.trades = [];
    this.nextTradeId = 1;
  }

  getPosition(instrument, marketPrice) {
    const position = this.positions.get(instrument);
    if (!position) return { instrument, exists: false, side: null, size: 0, unrealizedPnl: 0 };
    if (marketPrice !== undefined) position.unrealizedPnl = this.unrealizedPnl(position, marketPrice);
    return { ...position };
  }

  getPositions() { return Array.from(this.positions.values()).map(position => ({ ...position })); }
  getTrades() { return this.trades.map(trade => ({ ...trade })); }

  unrealizedPnl(position, marketPrice) {
    const price = Number(marketPrice);
    if (!Number.isFinite(price)) return position.unrealizedPnl || 0;
    return position.side === 'long'
      ? (price - position.entryPrice) * position.size
      : (position.entryPrice - price) * position.size;
  }

  execute(decision, candle) {
    const instrument = decision.instrument;
    const price = Number(candle.close);
    if (!Number.isFinite(price)) throw new Error('Paper trade price must be numeric');
    const existing = this.positions.get(instrument);
    if (decision.action === 'HOLD') {
      if (existing) existing.unrealizedPnl = this.unrealizedPnl(existing, price);
      return { status: 'held', position: this.getPosition(instrument, price) };
    }
    if (decision.action === 'ENTER') {
      if (existing) return { status: 'ignored', reason: 'Position already exists', position: this.getPosition(instrument, price) };
      const side = String((decision.trade && decision.trade.side) || 'long').toLowerCase();
      const size = Number(decision.trade && decision.trade.size);
      if (!['long', 'short'].includes(side) || !Number.isFinite(size) || size <= 0) throw new Error('Paper trade requires a valid side and positive size');
      const position = { instrument, exists: true, side, size, entryPrice: price, entryTime: candle.openTime, unrealizedPnl: 0 };
      this.positions.set(instrument, position);
      return { status: 'opened', position: { ...position } };
    }
    if (decision.action === 'EXIT') {
      if (!existing) return { status: 'ignored', reason: 'No position exists', position: this.getPosition(instrument, price) };
      const realizedPnl = this.unrealizedPnl(existing, price);
      const trade = { tradeId: 'paper-' + this.nextTradeId++, instrument, side: existing.side, size: existing.size, entryPrice: existing.entryPrice, exitPrice: price, entryTime: existing.entryTime, exitTime: candle.openTime, realizedPnl };
      this.trades.push(trade);
      this.positions.delete(instrument);
      return { status: 'closed', trade: { ...trade }, position: this.getPosition(instrument, price) };
    }
    throw new Error('Unsupported paper trade action: ' + decision.action);
  }
}

module.exports = PaperBroker;
