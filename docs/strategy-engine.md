# Strategy Engine

The strategy engine converts completed market candles into explainable trading decisions. It runs in the backend and does not depend on a browser or an SSE client.

## Data flow

```text
Binance WebSocket / REST backfill
            ↓
      Candle history
            ↓
  Aggregation and indicators
            ↓
       Strategy engine
            ↓
     Paper-trading broker
            ↓
 Decisions, positions, trades, and PnL
```

The engine subscribes to internal candle events. SSE is only the client-facing transport for dashboards and charting pages. Incomplete candles are ignored for decisions; only completed aggregates are evaluated.

## Configuration

Set `STRATEGY_FILE` to a YAML strategy file before starting the application. The sample file is `config/strategies/sample.yaml` and is disabled by default.

Required fields are:

```yaml
name: volume-confirmed-trend
version: 1
enabled: true
instruments: [btcusdt]
aggregation: 15m
indicators:
  - sma:20
  - sma:50
entry: { left: price.close, operator: ">", right: indicator.sma:20 }
exit: { left: price.close, operator: "<", right: indicator.sma:20 }
```

Supported aggregation intervals are the configured Binance intervals such as `1m`, `5m`, `15m`, `1h`, and `1d`. Indicator specifications use the existing registry syntax, for example `sma:20`, `rsi:14`, `macd:12:26:9`, or `bollinger:20:2`.

## References and operators

Conditions can reference `price.open`, `price.high`, `price.low`, `price.close`, `volume.volume`, `volume.quoteVolume`, `volume.trades`, indicator values, previous values, and position state.

```yaml
entry:
  all:
    - left: indicator.sma:20
      operator: crossesAbove
      right: indicator.sma:50
    - left: price.close
      operator: ">"
      right: indicator.sma:20
    - left: volume.volume
      operator: ">"
      right: indicator.volumeSma:20
```

Operators are `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `crossesAbove`, and `crossesBelow`. Use `all`, `any`, and `not` to combine conditions. Quote symbolic operators in YAML.

Multi-series indicators identify the series explicitly, for example `indicator.macd:12:26:9.macd`, `.signal`, or `.histogram`; Bollinger Bands use `.middle`, `.upper`, and `.lower`.

Missing or warming-up indicator values produce a non-matching condition. Crossover rules compare the current and previous completed aggregate. The engine deduplicates evaluations by strategy, version, instrument, aggregation, and candle timestamp.

## Example: trend and volume confirmation

```yaml
name: volume-confirmed-trend
version: 1
enabled: true
instruments: [btcusdt]
aggregation: 15m
indicators: [sma:20, sma:50, volumeSma:20]
entry:
  all:
    - { left: indicator.sma:20, operator: crossesAbove, right: indicator.sma:50 }
    - { left: price.close, operator: ">", right: indicator.sma:20 }
    - { left: volume.volume, operator: ">", right: indicator.volumeSma:20 }
exit:
  any:
    - { left: indicator.sma:20, operator: crossesBelow, right: indicator.sma:50 }
    - { left: price.close, operator: "<", right: indicator.sma:20 }
trade: { side: long, size: 0.01 }
```

This enters long when the fast average crosses above the slow average, price confirms the trend, and volume is above average. It exits on a bearish crossover or loss of the fast average.

## Example: RSI mean reversion

```yaml
name: rsi-mean-reversion
version: 1
enabled: false
instruments: [ethusdt]
aggregation: 15m
indicators: [rsi:14]
entry:
  all:
    - { left: indicator.rsi:14, operator: "<", right: 30 }
    - { left: position.exists, operator: "=", right: false }
exit:
  any:
    - { left: indicator.rsi:14, operator: ">", right: 60 }
    - { left: price.close, operator: ">", right: previous.price.close }
trade: { side: long, size: 0.01 }
```

## Decisions and APIs

The engine emits `ENTER`, `EXIT`, and `HOLD` decisions containing strategy metadata, candle timestamp, position context, entry/exit evaluations, and broker execution results. Read-only inspection endpoints are:

```text
GET /api/v1/strategy/status
GET /api/v1/strategy/decisions?instrument=btcusdt&limit=100
```

The sample strategy is disabled by default. Invalid YAML or unsupported references prevent that strategy from starting.
