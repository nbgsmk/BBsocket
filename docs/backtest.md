# Historical Strategy Backtesting

This document records the planned design for evaluating strategies on historical candles and simulating their trades. It is a future-reference specification; it does not describe a currently available backtest API.

## Execution modes

The application has three distinct uses of strategy logic:

```text
Live candles       → live StrategyEngine → persistent PaperBroker state
Historical chart   → historical signals → markers only
Historical test    → isolated StrategyEngine → in-memory PaperBroker
```

Live execution evaluates newly completed candles after the strategy starts. Historical chart evaluation is read-only and exists to display past entry/exit markers. Backtesting evaluates the same strategy rules over existing candles and simulates trades without affecting live state.

## Planned backtest flow

1. Load aggregated, completed candles for the strategy instrument and timeframe.
2. Calculate every configured indicator across the complete candle sequence.
3. Evaluate entry and exit conditions chronologically, including previous-candle values required by crossing operators.
4. Maintain an isolated simulated position so entries and exits alternate correctly.
5. Send generated decisions to a fresh in-memory `PaperBroker`.
6. Return decisions, completed trades, final position, and summary metrics.

The strategy configuration in `strategies/sma-cross.yaml` is the reference example. Its `sma:2` and `sma:10` indicators are used to detect crossing entries and exits.

## Isolation and safety

Backtests must not:

- call the live broker instance;
- modify live positions or trades;
- emit live strategy decision events;
- write historical decisions or trades to the live SQLite repository.

The in-memory broker reuses the normal paper-trading rules: configured side and size, one position per instrument, candle-close fills, and the existing long/short PnL calculations.

## Planned API

The strategy API will expose a dedicated endpoint similar to:

```text
GET /api/v1/strategy/backtest?strategy=sma-cross&instrument=btcusdt&limit=300
```

The response should include:

```json
{
  "strategy": "sma-cross",
  "decisions": [],
  "trades": [],
  "position": null,
  "metrics": {
    "tradeCount": 0,
    "realizedPnl": 0
  }
}
```

The exact response fields may grow, but the endpoint must remain separate from live decision and paper-account endpoints.

## Chart integration

When a strategy is selected, the chart can use backtest decisions for historical markers and continue consuming live SSE updates independently. Historical and live markers should be deduplicated by strategy, timestamp, and action.

- `ENTER`: green upward marker below the candle.
- `EXIT`: red downward marker above the candle.

Only decisions whose timestamps match loaded candles should be plotted.

## Assumptions and limitations

- Only completed candles are evaluated.
- Decisions are processed in chronological order.
- Simulated fills use candle close prices.
- Historical simulation is not real execution and must not be presented as live performance.
- Fees, slippage, leverage, margin, liquidation, partial fills, and order-book effects remain outside this first version.
