# Binance Futures WebSocket Service

This is a Node.js Express application that connects to Binance Coin-M and USD-M Futures WebSocket streams, keeps closed candlesticks in memory, and exposes them through HTTP and a browser dashboard.

## Current project status

The Binance implementation and shared market-data foundation are complete. The next planned feature is a real Deribit exchange adapter.

- Service, configuration, APIs, dashboard, live SSE feed, JSON formatting toggle, and documentation are implemented.
- Binance supports multiple Coin-M and USD-M symbols over separate combined streams.
- Shared candle history and aggregation are implemented in `services/market-data/candle-history.js`.
- Versioned Binance endpoints are under `/api/v1/binance`.
- Normalized candles use `candlestickIsClosed` to distinguish completed and incomplete data.
- Incomplete HTTP aggregation and aggregated live SSE are supported.
- Unit/API/SSE/dashboard contract tests are present under `test/`.
- The optional Playwright browser test requires Chromium to be installed.
- WebStorm’s bundled Node runtime can be used if `node` is not available on the terminal `PATH`.

## AI-assisted development setting

This project has been developed with JetBrains Webstorm 2026.2.1 and the following AI coding agent context:

| Item      | Value |
|-----------|-----|
| Agent     | Codex |
| Agent mode | "Agent" |
| Collaboration mode | "Default" = "Plan" |
| Fast mode | Off |
| LLM model | GPT-5.6 Luna |
| Reasoning | Medium |



Run verification from WebStorm’s terminal:

```bash
npm test
npx playwright install chromium
npm run test:browser
```

The browser test expects the application to be running at `http://127.0.0.1:3000`.

## Features

- Binance Coin-M continuous-contract and USD-M candlestick streams.
- Configurable contract symbols, exchange stream interval, and history size.
- Closed candlesticks only (`k.x === true`) are stored and returned to the calling browser.
- In-memory retention based on a configurable number of candles per symbol.
- Automatic reconnect with exponential backoff after unexpected disconnects.
- Persisted connection state in the configuration file.
- HTTP endpoints for connection control, status, candles, and live socket data.
- Browser dashboard with connection controls, live data history, and JSON formatting toggle.

## Exchange service interface

Exchange implementations follow the common contract in `services/exchanges/exchange-service.js`:

```js
connect()
disconnect()
status()
candles(symbol, options)
subscribe(listener)
```

The Binance implementation is located at `services/exchanges/binance/service.js`. Exchange-specific connection URLs, message parsing, symbol handling, and reconnect behavior remain inside each exchange implementation. The shared subscription method publishes normalized incoming market messages through the service's `message` event.

## Next planned development step

Implement a real Deribit adapter using the official Deribit API documentation. It should implement the same exchange-service interface, normalize Deribit market data into the shared candle format, and reuse the existing per-symbol history, aggregation, incomplete-candle, and live-SSE behavior. After that, add versioned Deribit routes.

### Deribit strategy reminder

This is a coarse planning reminder, not an implementation guide:

- Keep Binance as the primary venue for broad futures volume, liquidity, and order-flow analysis.
- Treat Deribit futures as a complementary BTC/ETH venue for basis, funding, hedging, and cross-venue comparisons.
- Use Deribit primarily for Gamma exposure (GEX) via options analysis, including implied volatility, skew, term structure, open interest, and expiry positioning.
- Do not combine raw Binance and Deribit volumes without normalizing contract size, settlement currency, and volume units.
- The most valuable long-term analysis may be the relationship between Deribit options positioning and Binance futures/perpetual flows.

### Deferred cross-exchange endpoints

Cross-exchange retrieval is planned but intentionally deferred for a later decision. A possible endpoint is:

```text
GET /api/v1/markets/candles?aggregation=1h&limit=100
```

It could return all configured markets grouped by exchange and symbol:

```json
{
  "binance": {
    "btcusd": { "candles": [] },
    "ethusd": { "candles": [] }
  },
  "deribit": {
    "btc-perpetual": { "candles": [] }
  }
}
```

Specific markets could be requested with:

```text
GET /api/v1/markets/candles?markets=binance:btcusd,deribit:btc-perpetual&aggregation=1h
```

Aggregation would apply consistently to every requested market, and `limit` would apply per symbol. Results would remain grouped because exchange symbols and instrument names may differ. If one exchange is unavailable, the response should return the other exchange’s data and report a per-market error rather than failing the entire request.

Exchange connection control would remain exchange-specific, for example `/api/v1/binance/coin-m/connect` and `/api/v1/deribit/connect`.

## Requirements

- Node.js 20 or newer is recommended. Node.js 10 or newer is required by the `ws` dependency.
- npm.
- Network access to `dstream.binance.com` for live Binance data.

## Installation

From the project directory:

```bash
npm install
```

Start the application:

```bash
npm start
```

The server listens on port `3000` by default. Set `PORT` to use another port:

```bash
PORT=8080 npm start
```

## Configuration

- ( Check the original Binance documentation for the [continuous-contract kline stream](https://binance-docs.github.io/apidocs/spot/en/#continuous-contract-kline-candlestick-streams) )

Configuration of both Binance market types is stored in [config/binancesocket.json](config/binancesocket.json):

```json
{
  "coinM": {
    "host": "dstream.binance.com",
    "tickerSymbols": ["BTCUSD_PERPETUAL", "ETHUSD_PERPETUAL"],
    "initialCandlesInMemory": 3000,
    "maxCandlesInMemory": 3000,
    "exchangeCandlestickStreamInterval": "1m",
    "fetchHistoricalCandlesOnStart": true,
    "connectOnStart": true
  },
  "usdM": {
    "host": "dstream.binance.com",
    "tickerSymbols": ["BTCUSDT", "ETHUSDT"],
    "initialCandlesInMemory": 3000,
    "maxCandlesInMemory": 3000,
    "exchangeCandlestickStreamInterval": "1m",
    "fetchHistoricalCandlesOnStart": false,
    "connectOnStart": false
  }
}
```

### Configuration fields

| Field | Description | Example |
| --- | --- | --- |
Each `coinM` and `usdM` section contains:

| Field | Description | Coin-M example | USD-M example |
| --- | --- | --- | --- |
| `host` | Binance WebSocket hostname; loaded case-insensitively and normalized to lowercase | `dstream.binance.com` | `dstream.binance.com` |
| `tickerSymbols` | Symbols subscribed to by that market service | `BTCUSD_PERPETUAL` | `BTCUSDT` |
| `initialCandlesInMemory` | Number of completed candles fetched per configured symbol during startup/manual historical backfill; capped at `maxCandlesInMemory` | `1000` | `1000` |
| `maxCandlesInMemory` | Maximum number of completed candles retained per symbol | `1000` | `1000` |
| `exchangeCandlestickStreamInterval` | Exchange candlestick stream input interval | `1m` | `1m` |
| `connectOnStart` | Connect on startup and remain enabled for reconnects; accepts boolean or case-insensitive string values such as `true`, `TRUE`, `false`, and `FALSE` | `true` | `false` |
| `fetchHistoricalCandlesOnStart` | Fetch completed candles from Binance REST before startup WebSocket connection; accepts boolean or case-insensitive string values | `true` | `false` |

Supported exchange stream intervals include `1s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, and `1M`.

Coin-M continuous-contract URLs are generated as:

```text
wss://dstream.binance.com/stream?streams={symbol1}@continuousKline_{interval}/{symbol2}@continuousKline_{interval}
```

USD-M uses the ordinary kline stream on the same `dstream.binance.com` host:

```text
wss://dstream.binance.com/stream?streams={symbol1}@kline_{interval}/{symbol2}@kline_{interval}
```

For the example configuration:

```text
wss://dstream.binance.com/stream?streams=btcusd_perpetual@continuousKline_1m/ethusd_perpetual@continuousKline_1m
wss://dstream.binance.com/stream?streams=btcusdt@kline_1m/ethusdt@kline_1m
```

`maxCandlesInMemory` is a candle count. For example, with `maxCandlesInMemory: 1000`, the service retains at most the latest 1000 completed candles per instrument, regardless of the configured interval.

The `connectOnStart` value is changed automatically by the connect and disconnect endpoints. The status API continues to expose the current runtime state as `connected`.

### Server configuration

The HTTP listener configuration is stored separately in [config/server.json](config/server.json):

```json
{
  "serverListenPort": 3000
}
```

The `PORT` environment variable takes precedence over `serverListenPort`, which is useful for deployment platforms:

```bash
PORT=8080 npm start
```

`serverListenPort` is the only server configuration parameter currently implemented. For local development, the default value of `3000` is sufficient.

## HTTP API

Strategy and paper-trading behavior is documented in [docs/strategy-engine.md](docs/strategy-engine.md) and [docs/paper-broker.md](docs/paper-broker.md).

Set `STRATEGY_DATA_PATH` to configure the SQLite file used for strategy decisions, positions, and paper trades. In Docker, mount its parent directory as a persistent volume.

All responses are JSON except the dashboard HTML page and the live Server-Sent Events stream.

### Dashboard

```text
GET /dashboard
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) in a browser. The dashboard provides buttons for connection control and status, displays the current WebSocket URL, and can show a scrolling history of live Binance messages.

### Connect

```text
GET  /api/v1/binance/coin-m/connect
POST /api/v1/binance/coin-m/connect
GET  /api/v1/binance/usd-m/connect
POST /api/v1/binance/usd-m/connect
```

Enables the service, persists `connectOnStart: true`, and opens the Binance WebSocket connection. The GET form is provided for convenient use from a browser address bar.

### Disconnect

```text
GET  /api/v1/binance/coin-m/disconnect
POST /api/v1/binance/coin-m/disconnect
GET  /api/v1/binance/usd-m/disconnect
POST /api/v1/binance/usd-m/disconnect
```

Disables the service, persists `connectOnStart: false`, cancels pending reconnects, and closes the active WebSocket.

### Status

```text
GET /api/v1/binance/coin-m/status
GET /api/v1/binance/usd-m/status
```

Example response:

```json
{
  "connected": true,
  "socketOpen": true,
  "tickerSymbols": ["BTCUSD_PERPETUAL", "ETHUSD_PERPETUAL"],
  "webSocketUrl": "wss://dstream.binance.com/stream?streams=btcusd_perpetual@continuousKline_1m/ethusd_perpetual@continuousKline_1m",
  "exchangeCandlestickStreamInterval": "1m",
  "maxCandlesInMemory": 1000,
  "candles": {
    "btcusd_perpetual": 42,
    "ethusd_perpetual": 41
  }
}
```

`connected` is the persisted service preference. `socketOpen` indicates whether the underlying WebSocket is currently open; it can be false temporarily while reconnecting.

### Candles

```text
GET /api/v1/binance/coin-m/candles/snapshot?instrument=btcusd_perpetual
GET /api/v1/binance/coin-m/candles/snapshot?instrument=ethusd_perpetual&limit=100
GET /api/v1/binance/coin-m/candles/snapshot?instrument=btcusd_perpetual&aggregation=5m&limit=100
GET /api/v1/binance/usd-m/candles/snapshot?instrument=btcusdt&aggregation=15m&includeIncomplete=true
GET /api/v1/binance/usd-m/candles/snapshot?instrument=btcusdt&aggregation=15m&indicators=sma:20,ema:50,rsi:14,atr:14,vwap,vwma:20,adx:14,stochastic:14:3:3,macd:12:26:9,bollinger:20:2,volumeSma:20,volumeEma:20
```

The `instrument` query parameter must contain the full configured instrument, lowercased in the URL. Coin-M uses names such as `instrument=btcusd_perpetual`; USD-M uses names such as `instrument=btcusdt`.

The optional `limit` parameter returns the newest requested number of candles. It must be a positive integer. The result can never contain more candles than are currently retained in memory.

The optional `aggregation` parameter combines the stored subscription candles into a larger, UTC-aligned interval at request time. The original subscription candles remain in memory. Only complete aggregation windows are returned; a window with missing source candles is skipped. `aggregation` must be equal to or a multiple of the selected service's `exchangeCandlestickStreamInterval`; calendar-month aggregation (`1M`) is not supported. The custom local intervals `2m`, `10m`, `20m`, `2d`, `4d`, and `5d` are also supported.

Set `includeIncomplete=true` to include the current in-progress aggregate in the HTTP snapshot. It is marked with `candlestickIsClosed: false` and is built from the latest live 1-minute update. It is not added to completed history.

The optional `indicators` parameter returns an enriched snapshot containing `instrument`, `aggregation`, `candles`, and an `indicators` array. Period-based indicators use the format `type:period`, separated by commas, for example `indicators=sma:20,ema:50`; parameterless indicators such as VWAP use only their type, for example `vwap`. Supported indicators are SMA, EMA, RSI, ATR, VWAP, VWMA, ADX, Stochastic, MACD, Bollinger Bands, volume SMA, and volume EMA. Stochastic uses `stochastic:kPeriod:dPeriod:slowing`, for example `stochastic:14:3:3`; MACD uses `macd:fastPeriod:slowPeriod:signalPeriod`, for example `macd:12:26:9`; Bollinger Bands use `bollinger:period:standardDeviations`, for example `bollinger:20:2`; volume indicators use `volumeSma:period` or `volumeEma:period`; VWMA uses `vwma:period`. Indicator values are aligned with candle timestamps through `openTime`. The indicator calculation is performed before `limit` is applied, preserving correct warm-up behavior.

Example candle:

```json
{
  "symbol": "btcusd",
  "instrument": "btcusd_perpetual",
  "exchangeCandlestickStreamInterval": "1m",
  "openTime": 1720000000000,
  "closeTime": 1720000059999,
  "open": "60000.0",
  "high": "60020.0",
  "low": "59990.0",
  "close": "60010.0",
  "volume": "125.50",
  "quoteVolume": "7537500.00",
  "trades": 1250
}
```

Only completed candles are retained. When `fetchHistoricalCandlesOnStart` is true, the service backfills up to `initialCandlesInMemory` candles per configured symbol from the appropriate Binance REST endpoint (using pagination when needed) before opening an initially enabled WebSocket connection. If `initialCandlesInMemory` is omitted, it defaults to `maxCandlesInMemory`; larger values are capped at `maxCandlesInMemory`. If historical fetching is disabled, history begins accumulating after a connection is established.

### Live socket data

```text
GET /api/v1/binance/coin-m/live
GET /api/v1/binance/usd-m/live
```

This is a Server-Sent Events endpoint. It forwards incoming Binance WebSocket messages to connected browser clients, including updates for candles that are not yet closed. Each event is sent as a JSON `data:` field.

For server-aggregated live candles, use:

```text
GET /api/v1/binance/coin-m/candles/live?instrument=btcusd_perpetual&aggregation=15m
```

This keeps an SSE connection open and sends the newest aggregate whenever the selected symbol receives a 1-minute update. The same aggregate is updated by `openTime`; clients should replace an existing chart candle when that timestamp repeats. Updates have `candlestickIsClosed: false` until the 15-minute window completes, then the final update has `candlestickIsClosed: true`.

To receive only one event per completed aggregate, set `includeIncomplete=false`:

```text
GET /api/v1/binance/coin-m/candles/live?instrument=btcusd_perpetual&aggregation=15m&includeIncomplete=false
```

All server-aggregated candle SSE events use the same envelope. OHLC data is always under `candlestick`, and `indicators` is always an array (empty when no indicators were requested).

This mode suppresses the initial snapshot and all in-progress updates. It emits one event when each new aggregated candle closes and ignores duplicate close updates.

### Indicator-enriched live events

The live endpoint remains a single SSE endpoint and requests calculated indicators with an optional `indicators` parameter:

```text
GET /api/v1/binance/usd-m/candles/live?instrument=btcusdt&aggregation=15m&indicators=sma:20,ema:50
```

The parameter is a comma-separated list of indicator specifications. Each specification contains an indicator type and period separated by a colon:

```text
indicators=sma:20,sma:50,ema:20,rsi:14,atr:14,vwap,vwma:20,adx:14,stochastic:14:3:3,macd:12:26:9,bollinger:20:2,volumeSma:20,volumeEma:20
```

The combined event format is:

```json
{
  "eventType": "candlestickUpdate",
  "exchange": "binance",
  "marketType": "usd-m",
  "instrument": "btcusdt",
  "aggregation": "15m",
  "openTime": 1720000000000,
  "closeTime": 1720000899999,
  "candlestickIsClosed": false,
  "candlestick": {
    "open": "60000",
    "high": "60100",
    "low": "59900",
    "close": "60050",
    "volume": "125.5"
  },
  "indicators": [
    {
      "type": "sma",
      "parameters": { "period": 20 },
      "series": [
        { "name": "value", "value": "59875.42" }
      ]
    },
    {
      "type": "ema",
      "parameters": { "period": 50 },
      "series": [
        { "name": "value", "value": "59720.18" }
      ]
    }
  ]
}
```

Snapshot indicator objects use the same `type`, `parameters`, and `series` structure, with each series containing a timestamped `values` array. Live events contain the current `value` for each named series. A single-series indicator such as SMA therefore uses `series: [{ "name": "value", ... }]`, while multi-series indicators such as MACD can add named `macd`, `signal`, and `histogram` series.

The reusable indicator calculations are implemented in `services/market-data/indicators.js`, and the `indicators` parameter is supported for both candle snapshots and live SSE events. VWAP is anchored to each UTC day and uses typical price `(high + low + close) / 3` weighted by candle volume. VWMA is a rolling close-price average weighted by volume. ADX uses Wilder smoothing and exposes `adx`, `plusDi`, and `minusDi` series. Stochastic exposes `k` and `d` series. MACD exposes `macd`, `signal`, and `histogram`; Bollinger Bands expose `middle`, `upper`, and `lower`. Indicator values correlate with candles through `instrument`, `aggregation`, and `openTime`, rather than array position. When there is insufficient history for a requested period, its `value` is `null`. Repeated events with the same `openTime` represent updates to the same live candle. The final event for that candle has `candlestickIsClosed: true`.

When `indicators` is omitted, the existing candle-only live-event behavior remains unchanged. The same request syntax and response structure are used for Coin-M and USD-M services.

The dashboard provides an optional indicator toggle, indicator type, and period input. When enabled, it opens the aggregated candle SSE endpoint for the first configured instrument using the selected period.

Example with curl:

```bash
curl -N http://localhost:3000/api/v1/binance/coin-m/live
```

The dashboard keeps the most recent 300 live messages in browser memory and displays them in a scrollable field. The formatting toggle switches between formatted JSON and normalized single-line JSON.

## Data flow

```text
Binance Coin-M WebSocket
          |
          v
binancesocket service
     |              |
     |              +--> SSE live stream --> Dashboard
     |
     +--> closed-candle history --> GET /:symbol
```

The service stores data only in memory. Restarting the application clears candle history, but the persisted `connected` setting is retained.

## Testing

The project includes unit, API, SSE, and dashboard contract tests in the `test` directory.

Run the standard suite:

```bash
npm test
```

The tests cover:

- Configuration validation and persistence.
- WebSocket URL construction.
- Closed-candle filtering and duplicate replacement.
- History retention.
- Connect/disconnect behavior.
- Candle and status API responses.
- Invalid symbols and limits.
- SSE route availability.
- Dashboard controls and formatting toggle presence.

An optional Playwright browser test is also included:

```bash
npx playwright install chromium
npm run test:browser
```

The browser test expects the application to be running at `http://127.0.0.1:3000`.

## Troubleshooting

### The candle endpoint returns an empty array

Make sure the service is connected and wait for a candle to close. With `1m`, the first closed candle may take up to one minute. The service does not retrieve historical candles from Binance.

### `socketOpen` is false while `connected` is true

The service is enabled but may still be connecting or retrying after a network failure. Check application logs and network/DNS access to `dstream.binance.com`.

### The dashboard cannot connect

Confirm that the Express server is running and that the browser is using the same host and port. The live data button controls the browser’s SSE connection; the Binance WebSocket itself must first be enabled with Connect.

### Configuration validation fails

Use an instrument name such as `BTCUSD_PERPETUAL` or `BTCUSDT`, a positive integer for `maxCandlesInMemory`, and one of the supported intervals in `exchangeCandlestickStreamInterval`.

## Security and deployment notes

The connect and disconnect endpoints currently have no authentication. Keep the service bound to a trusted local network or add authentication before exposing it publicly.

The candle history is process-local and is not suitable as durable storage. Use a database or time-series store if data must survive restarts or support long-term queries.

## Potential future server features

The following settings could be added to `config/server.json` if the application needs more deployment or security controls:

- `serverListenHost`: Network interface to bind to. Use `127.0.0.1` for local-only access or `0.0.0.0` to accept connections from other interfaces.
- `requestBodyLimit`: Maximum accepted JSON/request body size, for example `"100kb"`. This helps prevent oversized requests.
- `corsOrigins`: List of browser origins allowed to call the API. This should be restricted to trusted dashboard or client origins.
- `accessLogLevel`: HTTP logging verbosity, such as `"dev"` for development or `"combined"` for more detailed deployment logs.
- `rateLimit`: Request limits for clients within a time window. This helps protect the API from accidental or malicious request floods.
- `shutdownTimeout`: Maximum time to wait for active HTTP and WebSocket work to finish during graceful shutdown.
- `apiKey`: Credential required for connection-control and status endpoints before exposing the service beyond a trusted local network.

These parameters are documentation only and are not currently read by the application.

## Potential future market-data enhancements

The following order-flow metrics require raw trade or order-book data and are not calculated from the current candlestick streams:

- **Large-trade detection**: identifies trades whose price multiplied by quantity exceeds a configurable notional threshold.
- **Buy volume versus sell volume**: separates executed volume by aggressive buyer or seller direction.
- **Cumulative volume delta**: accumulates aggressive buy volume minus aggressive sell volume over a selected session or period.
- **Trade imbalance**: compares buy and sell volume within a window, commonly `(buy volume - sell volume) / (buy volume + sell volume)`.
- **Order-book imbalance**: compares displayed bid and ask liquidity across one or more order-book levels.
- **Depth-weighted mid-price**: estimates a liquidity-weighted midpoint using bid and ask prices and their available quantities.

Trade-based metrics will require individual trade streams. Order-book metrics will require depth or order-book streams. These should eventually be normalized alongside the existing candle data and exposed through separate order-flow resources.
