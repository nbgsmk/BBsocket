# Indicators

This document describes the indicators currently implemented by the shared market-data indicator registry. They can be requested through the candle APIs and used by the strategy engine. See [strategy-engine.md](strategy-engine.md) for condition syntax and strategy configuration.

## Indicator overview

- **SMA**: average closing price over a fixed number of candles.
- **EMA**: moving average that gives more weight to recent closing prices.
- **RSI**: momentum oscillator from 0 to 100 based on average gains and losses.
- **ATR**: volatility measure based on the average true range of candles.
- **VWAP**: cumulative volume-weighted typical price, resetting at each UTC day.
- **VWMA**: rolling moving average weighted by volume over a fixed candle period.
- **ADX**: measures trend strength; `+DI` and `-DI` help show direction.
- **Stochastic**: compares the close with the recent high-low range.
- **MACD**: compares fast and slow EMAs.
- **Bollinger Bands**: moving average with upper and lower bands based on standard deviation.
- **Volume SMA**: moving average calculated from candle volume.
- **Volume EMA**: exponential moving average calculated from candle volume.
- **Trade count**: number of exchange trades in each candle; `tradeCountSma:period` and `tradeCountEma:period` provide moving averages.

## Using indicators

The candle snapshot and live endpoints accept a comma-separated `indicators` parameter:

```text
GET /api/v1/binance/usd-m/candles/snapshot?instrument=btcusdt&aggregation=15m&indicators=sma:20,ema:50,rsi:14,vwap,macd:12:26:9,bollinger:20:2
```

Indicator specifications are case-insensitive and are normalized to lowercase. Periods must be positive integers. Values are aligned with candle timestamps through `openTime`. Warm-up points are returned with a `null` value until enough candle data is available.

## Implemented indicators

### SMA — Simple Moving Average

`sma:period`

The average closing price over a fixed number of candles. It smooths price movement and is commonly used to identify trend direction or moving-average crossovers.

Output series: `value`.

### EMA — Exponential Moving Average

`ema:period`

A moving average that gives more weight to recent closing prices, allowing it to respond faster than an SMA.

Output series: `value`.

### RSI — Relative Strength Index

`rsi:period`

A momentum oscillator from 0 to 100 based on average gains and losses. Higher values indicate stronger recent upward momentum; lower values indicate stronger recent downward momentum.

Output series: `value`.

### ATR — Average True Range

`atr:period`

A volatility measure based on the true range of each candle. It measures the magnitude of price movement rather than its direction.

Output series: `value`.

### VWAP — Volume-Weighted Average Price

`vwap`

The cumulative volume-weighted typical price. In this application, VWAP resets at the beginning of each UTC day and does not take a parameter.

Output series: `value`.

### VWMA — Volume-Weighted Moving Average

`vwma:period`

A rolling moving average weighted by candle volume over a fixed period. Candles with greater volume have more influence on the result.

Output series: `value`.

### ADX — Average Directional Index

`adx:period`

A measure of trend strength, not trend direction. The directional series help identify the dominant pressure: `plusDi` represents positive direction and `minusDi` represents negative direction.

Output series: `adx`, `plusDi`, `minusDi`.

### Stochastic Oscillator

`stochastic:kPeriod:dPeriod:slowing`

Compares the closing price with the recent high-low range. `k` is the faster line and `d` is its signal average. `slowing` controls smoothing of the fast line.

Output series: `k`, `d`.

Example: `stochastic:14:3:3`.

### MACD — Moving Average Convergence/Divergence

`macd:fastPeriod:slowPeriod:signalPeriod`

Compares fast and slow EMAs. The result includes the MACD line, its signal line, and the difference between them as a histogram. The fast period must be less than the slow period.

Output series: `macd`, `signal`, `histogram`.

Example: `macd:12:26:9`.

### Bollinger Bands

`bollinger:period:standardDeviations`

A moving average surrounded by upper and lower bands calculated from standard deviation. The bands widen as recent price dispersion increases and narrow as it decreases.

Output series: `middle`, `upper`, `lower`.

Example: `bollinger:20:2`. The standard-deviation parameter must be non-negative.

### Volume SMA — Volume Simple Moving Average

`volumeSma:period`

A simple moving average calculated from candle volume instead of closing price. It can be used to compare current volume with its recent average.

Output series: `value`.

### Volume EMA — Volume Exponential Moving Average

`volumeEma:period`

An exponential moving average calculated from candle volume instead of closing price. It responds more quickly to recent changes in volume than Volume SMA.

Output series: `value`.

## Strategy references

Single-series indicators can be referenced directly:

```yaml
positionEntry:
  matchAll:
    - { left: price.close, operator: ">", right: indicator.sma:20 }
    - { left: volume.volume, operator: ">", right: indicator.volumeSma:20 }
```

Multi-series indicators include the series name in the reference:

```yaml
positionExit:
  matchAny:
    - { l: indicator.macd:12:26:9.histogram, op: "<", r: 0 }
    - { l: price.close, op: ">", r: indicator.bollinger:20:2.upper }
```

Available multi-series names are:

- ADX: `.adx`, `.plusDi`, `.minusDi`
- Stochastic: `.k`, `.d`
- MACD: `.macd`, `.signal`, `.histogram`
- Bollinger Bands: `.middle`, `.upper`, `.lower`

Missing or warming-up indicator values produce a non-matching strategy condition.

## Future order-flow metrics

The following metrics are not currently implemented. They require data beyond candlestick streams.

### Large-trade detection

Finds trades whose notional value exceeds a configurable threshold:

```text
notional = price × quantity
```

### Buy volume versus sell volume

Separates executed volume according to aggressive buyer or seller direction:

```text
net volume = buy volume - sell volume
```

### Cumulative volume delta

Accumulates the difference between aggressive buying and selling:

```text
delta = buy volume - sell volume
CVD = previous CVD + delta
```

### Trade imbalance

Compares buying and selling pressure in a bounded window:

```text
(buy volume - sell volume) / (buy volume + sell volume)
```

Values near `+1` indicate buying dominance, values near `-1` indicate selling dominance, and `0` indicates balance.

### Order-book imbalance

Compares displayed bid and ask liquidity:

```text
(bid quantity - ask quantity) / (bid quantity + ask quantity)
```

### Depth-weighted mid-price

A midpoint influenced by available bid and ask quantities:

```text
(ask price × bid quantity + bid price × ask quantity) /
(bid quantity + ask quantity)
```

Large-trade and buy/sell metrics require individual trade streams. Order-book imbalance and depth-weighted mid-price require depth/order-book streams. Candlestick streams alone are not sufficient for these calculations.
### Trade count

`tradeCount` plots the number of exchange trades in each candle. `tradeCountSma:period` and `tradeCountEma:period` calculate moving averages of that count. These indicators are grouped in the volume/activity pane.

```yaml
indicators:
  - tradeCount
  - tradeCountSma:20
  - tradeCountEma:20
```
