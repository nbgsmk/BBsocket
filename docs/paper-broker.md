# In-Memory Paper Broker

The paper broker simulates the execution of strategy decisions. It is deliberately small: it models positions, entry/exit prices, size, and PnL without sending real orders.

## Role in the system

```text
Strategy decision → Paper broker → Position/trade result
```

The strategy engine supplies the completed candle close as the simulated execution price. The broker supports one open position per instrument and both long and short positions.

## Position lifecycle

An `ENTER` decision opens a position using the strategy’s `trade.side` and `trade.size`. A position contains:

```json
{
  "instrument": "btcusdt",
  "exists": true,
  "side": "long",
  "size": 0.01,
  "entryPrice": 60000,
  "entryTime": 1788308040000,
  "unrealizedPnl": 0
}
```

An `EXIT` decision closes the position and creates a completed trade. `HOLD` leaves the position open and updates unrealized PnL using the latest candle close.

Duplicate entries are ignored while a position exists. Exits without an open position are ignored. Invalid sides, sizes, or prices are rejected.

## PnL

For a position size `size`:

```text
long PnL  = (exitPrice - entryPrice) × size
short PnL = (entryPrice - exitPrice) × size
```

For example, a long position of size `2` entered at `100` and exited at `105` has PnL `10`. A short position of size `1` entered at `200` and exited at `180` has PnL `20`.

## Interfaces

```js
broker.execute(decision, candle)
broker.getPosition(instrument, marketPrice)
broker.getPositions()
broker.getTrades()
```

Completed trades contain a generated `tradeId`, instrument, side, size, entry and exit prices/times, and realized PnL.

## Inspection APIs

```text
GET /api/v1/paper/positions
GET /api/v1/paper/positions?instrument=btcusdt
GET /api/v1/paper/trades?instrument=btcusdt&limit=100
```

These endpoints are read-only. Results are snapshots and do not allow callers to modify broker state.

## Persistence

When an enabled strategy runtime is configured, decisions, open positions, and completed trades are stored in SQLite. Set `STRATEGY_DATA_PATH` to choose the database location; the default is `data/strategy.sqlite`. Mount that directory as a Docker volume so state survives container replacement:

```yaml
volumes:
  - ./data:/app/data
```

## Current limitations

The in-memory broker remains available for isolated tests, but the application runtime uses SQLite when a strategy is enabled. The current model does not include fees, slippage, leverage, margin, liquidation, partial fills, or order-book execution.
