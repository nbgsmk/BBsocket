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

Set `STRATEGY_FILE` to a YAML strategy file before starting the application. The sample file is `strategies/sample.yaml` and is disabled by default.

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
positionEntry: { left: price.close, operator: ">", right: indicator.sma:20 }
positionExit: { left: price.close, operator: "<", right: indicator.sma:20 }
```

The top-level strategy keywords are:

| Keyword | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Strategy name. |
| `version` | yes | Positive integer strategy version. |
| `enabled` | yes | Whether the strategy is active. |
| `instruments` | yes | Non-empty list of instruments. Values are normalized to lowercase. |
| `aggregation` | yes | Candle aggregation interval. |
| `indicators` | yes | List of indicator specifications. An empty list is allowed. |
| `positionEntry` | yes | Condition that can open a position. |
| `positionExit` | yes | Condition that can close a position. |
| `trade` | no | Trade details used when an `ENTER` decision is executed. |

The supported `trade` fields are `side` and `size`. `size` must be positive. The paper broker supports `long` and `short` sides, one complete position per instrument, and full-position exits; partial closes are not supported.

Supported aggregation intervals are `1s`, `1m`, `2m`, `3m`, `5m`, `10m`, `15m`, `20m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `2d`, `3d`, `4d`, `5d`, and `1w`.

## Indicators

Indicator specifications are strings in the `indicators` list:

| Indicator | Specification | Output series |
| --- | --- | --- |
| Simple moving average | `sma:period` | value |
| Exponential moving average | `ema:period` | value |
| Relative strength index | `rsi:period` | value |
| Average true range | `atr:period` | value |
| Volume-weighted average price | `vwap` | value |
| Volume-weighted moving average | `vwma:period` | value |
| Average directional index | `adx:period` | `adx`, `plusDi`, `minusDi` |
| Stochastic oscillator | `stochastic:kPeriod:dPeriod:slowing` | `k`, `d` |
| MACD | `macd:fastPeriod:slowPeriod:signalPeriod` | `macd`, `signal`, `histogram` |
| Bollinger Bands | `bollinger:period:standardDeviations` | `middle`, `upper`, `lower` |
| Volume SMA | `volumeSma:period` | value |
| Volume EMA | `volumeEma:period` | value |

Periods must be positive integers. Bollinger standard deviations must be non-negative. For MACD, the fast period must be less than the slow period. Examples include `sma:20`, `rsi:14`, `vwap`, `stochastic:14:3:3`, `macd:12:26:9`, and `bollinger:20:2`.

## References and operators

Conditions are built from logical groups or comparisons. The logical keywords are:

| Keyword | Value | Meaning |
| --- | --- | --- |
| `matchAll` | Non-empty condition list | Matches only when every child condition matches. |
| `matchAny` | Non-empty condition list | Matches when at least one child condition matches. |
| `not` | One condition | Inverts the child condition result. |

Comparison keywords are `left`, `operator`, and `right`. Compact aliases are also supported: `l` means `left`, `op` means `operator`, and `r` means `right`. A condition must not provide both a canonical key and its alias. Aliases are case-sensitive; `L`, `OP`, and `R` are different keys and are not supported.

The `between` operator uses `value` instead of `right`, with exactly two values.

```yaml
positionEntry:
  matchAll:
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

Operators are `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `crossesAbove`, and `crossesBelow`. Use `matchAll`, `matchAny`, and `not` to combine conditions. 

**Arithmetic operators like "<" ">" and similar MUST BE QUOTED.**

References use these namespaces:

| Namespace | Available fields |
| --- | --- |
| `price.*` | `open`, `high`, `low`, `close` |
| `volume.*` | `volume`, `quoteVolume`, `trades` |
| `indicator.*` | Configured indicator values and series |
| `previous.price.*` | Previous aggregate candle fields |
| `previous.indicator.*` | Previous indicator values and series |
| `position.*` | `exists`, `side`, `size` |

Multi-series indicators identify the series explicitly, for example `indicator.macd:12:26:9.macd`, `.signal`, or `.histogram`; Bollinger Bands use `.middle`, `.upper`, and `.lower`; ADX uses `.adx`, `.plusDi`, and `.minusDi`; and Stochastic uses `.k` and `.d`.

Missing or warming-up indicator values produce a non-matching condition. Crossover rules compare the current and previous completed aggregate. The engine deduplicates evaluations by strategy, version, instrument, aggregation, and candle timestamp.

For example, the same comparison can use either the long or compact key names:

```yaml
positionExit:
  matchAny:
    - { left: indicator.sma:20, operator: crossesBelow, right: indicator.sma:50 }
    - { l: indicator.rsi:14, op: ">", r: 75 }
```

## Example: trend and volume confirmation

```yaml
name: volume-confirmed-trend
version: 1
enabled: true
instruments: [btcusdt]
aggregation: 15m
indicators: [sma:20, sma:50, volumeSma:20]
positionEntry:
  matchAll:
    - { left: indicator.sma:20, operator: crossesAbove, right: indicator.sma:50 }
    - { left: price.close, operator: ">", right: indicator.sma:20 }
    - { left: volume.volume, operator: ">", right: indicator.volumeSma:20 }
positionExit:
  matchAny:
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
positionEntry:
  matchAll:
    - { left: indicator.rsi:14, operator: "<", right: 30 }
    - { left: position.exists, operator: "=", right: false }
positionExit:
  matchAny:
    - { left: indicator.rsi:14, operator: ">", right: 60 }
    - { left: price.close, operator: ">", right: previous.price.close }
trade: { side: long, size: 0.01 }
```

## Decisions and APIs

The engine emits `ENTER`, `EXIT`, and `HOLD` decisions containing strategy metadata, candle timestamp, position context, positionEntry/positionExit evaluations, and broker execution results. Read-only inspection endpoints are:

```text
GET /api/v1/strategy/status
GET /api/v1/strategy/decisions?instrument=btcusdt&limit=100
```

The sample strategy is disabled by default. Invalid YAML or unsupported references prevent that strategy from starting.
