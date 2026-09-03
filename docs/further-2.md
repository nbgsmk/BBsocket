# Strategy Simulator: Current State and Further Work

This document follows up on the original simulator plan and records what is currently implemented, using [`strategies/sample.yaml`](../strategies/sample.yaml) as the example strategy.

## Current sample strategy

The sample strategy monitors `btcusdt` using completed 5-minute candles. It defines these indicators:

- A fast SMA with period 5.
- A slow SMA with period 10.
- RSI with period 14.
- A volume SMA with period 5.

It enters a long paper position only when all of the following are true:

1. The fast SMA crosses above the slow SMA.
2. The closing price is above the fast SMA.
3. Current volume is above the volume SMA.

It exits when either the fast SMA crosses below the slow SMA or RSI rises above 75. Each entry uses a paper-trade size of `0.01`.

The YAML file uses named indicator aliases (`smaF`, `smaS`, `rsi`, and `volSma`) so conditions remain readable. Both full condition keys and compact aliases are supported.

## Current implementation

The application now supports the main live paper-trading workflow:

```text
Binance candles
      ↓
Aggregation and indicators
      ↓
Strategy conditions
      ↓
ENTER / EXIT / HOLD decision
      ↓
Paper broker
      ↓
SQLite decisions, positions, trades, and PnL
```

Strategies are loaded from `strategies/` at startup. Each strategy defines one instrument and one aggregation interval. Enabled strategies run headlessly from internal completed-candle events; the browser and SSE endpoints are for inspection and charting, not for driving execution.

`includeIncomplete=false` and completed aggregated candles should be used for strategy decisions. This avoids acting on a candle whose close, volume, or indicators can still change. Incomplete candles remain useful for display.

Implemented capabilities include:

- YAML strategy validation and startup error reporting.
- Indicator specifications and named aliases.
- Logical conditions, comparisons, and crossover operators.
- Long and short paper positions.
- Position size, entry price, exit price, realized PnL, and unrealized PnL.
- SQLite persistence for enabled runtime strategies.
- Read-only APIs for strategy status, decisions, positions, and trades.
- Historical decision inspection for chart markers.

The paper broker intentionally does not model fees, slippage, leverage, liquidation, partial fills, or order-book execution yet.

## Storage decision

SQLite is the source of truth for runtime state. It is a better fit than CSV for this application because positions are mutable, decisions and trades need reliable persistence, and queries will be useful for charting by strategy, instrument, and time range. SQLite also remains a single portable file with no separate database service.

CSV export can be added later for spreadsheet or external analysis, but CSV should not be the primary store. It is append-oriented and makes position updates, duplicate protection, and filtered queries more difficult.

## Further work

### 1. Restart and duplicate protection

Persist the last processed completed-candle timestamp for each strategy, instrument, and aggregation. On restart or reconnect, the engine must not evaluate the same candle twice or create duplicate entries and exits. This is important even when positions are only being displayed on a chart.

### 2. Improve chart inspection

Expose historical and live position events in a consistent format so a separate chart can display:

- Entry markers.
- Exit markers.
- Open-position ranges.
- Entry and exit prices.
- Realized PnL per completed trade.

Historical markers and live markers should be deduplicated by strategy version, candle timestamp, and action.

### 3. Add isolated historical backtesting

Historical backtesting is not currently a public feature. The planned implementation should reuse the existing indicator and condition logic, but run against a fresh in-memory paper broker:

1. Load completed historical candles.
2. Calculate indicators across the full sequence to preserve warm-up behavior.
3. Evaluate conditions chronologically with previous-candle context for crossovers.
4. Simulate entries and exits without touching live SQLite state.
5. Return decisions, completed trades, final position, and summary PnL.

This will allow the same strategy file to be inspected against historical data without mixing backtest results with the live paper-trading run.

### 4. Optional CSV export

After SQLite-backed inspection is stable, add an explicit export endpoint or command for trades and decisions. Export should be a derived view of SQLite rather than a second source of truth.

## Recommended order

1. Keep the sample strategy disabled by default unless live paper execution is intentionally wanted.
2. Complete the remaining test-environment and fixture issues.
3. Add restart and duplicate protection.
4. Add chart-friendly position and trade markers.
5. Implement isolated historical backtesting.
6. Add optional CSV export and performance summaries.

Advanced execution realism can remain deferred until the basic decision, position, PnL, persistence, and chart-review workflow proves useful.
