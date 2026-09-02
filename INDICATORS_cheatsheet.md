# Indicators and Order-Flow Cheatsheet

## Current indicators

- **SMA**: average closing price over a fixed number of candles.
- **EMA**: moving average that gives more weight to recent closing prices.
- **RSI**: momentum oscillator from 0 to 100 based on average gains and losses.
- **ATR**: volatility measure based on the average true range of candles.
- **VWAP**: cumulative volume-weighted typical price; this application resets it at each UTC day.
- **VWMA**: rolling moving average weighted by volume; it uses a fixed candle period.
- **ADX**: measures trend strength, not trend direction. `+DI` and `-DI` help show direction.
- **Stochastic**: compares the close with the recent high-low range. `%K` is the fast line and `%D` is its signal average.
- **MACD**: compares fast and slow EMAs and returns the MACD line, signal line, and histogram.
- **Bollinger Bands**: a moving average with upper and lower bands based on standard deviation.
- **Volume SMA/EMA**: moving averages calculated from candle volume instead of closing price.

## Future order-flow metrics

- **Large-trade detection**: finds trades whose notional value exceeds a configurable threshold.

  ```text
  notional = price × quantity
  ```

- **Buy volume versus sell volume**: separates executed volume according to aggressive buyer or seller direction.

  ```text
  net volume = buy volume - sell volume
  ```

- **Cumulative volume delta**: accumulates the difference between aggressive buying and selling.

  ```text
  delta = buy volume - sell volume
  CVD = previous CVD + delta
  ```

- **Trade imbalance**: compares buying and selling pressure in a bounded window.

  ```text
  (buy volume - sell volume) / (buy volume + sell volume)
  ```

  Values near `+1` indicate buying dominance, values near `-1` selling dominance, and `0` balance.

- **Order-book imbalance**: compares displayed bid and ask liquidity.

  ```text
  (bid quantity - ask quantity) / (bid quantity + ask quantity)
  ```

- **Depth-weighted mid-price**: a midpoint influenced by available bid and ask quantities.

  ```text
  (ask price × bid quantity + bid price × ask quantity) /
  (bid quantity + ask quantity)
  ```

Trade metrics require individual trade streams. Order-book metrics require depth/order-book streams. Candlestick streams alone are not sufficient for these calculations.
