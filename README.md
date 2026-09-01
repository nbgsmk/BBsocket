# Binance Coin-M Futures WebSocket Service

This is a node.js Express application that connects to Binance Coin-M Futures continuous-contract WebSocket streams (1 second update), keeps closed candlesticks in memory, and exposes them through HTTP and a browser dashboard.

## Current project status

The Binance implementation and shared market-data foundation are complete. The next planned feature is a real Deribit exchange adapter.

- Service, configuration, APIs, dashboard, live SSE feed, JSON formatting toggle, and documentation are implemented.
- Binance supports multiple symbols over one combined 1-minute candlestick stream.
- Shared candle history and aggregation are implemented in `services/market-data/candle-history.js`.
- Versioned Binance endpoints are under `/api/v1/binance`.
- Normalized candles use `candlestickIsClosed` to distinguish completed and incomplete data.
- Incomplete HTTP aggregation and aggregated live SSE are supported.
- Unit/API/SSE/dashboard contract tests are present under `test/`.
- The optional Playwright browser test requires Chromium to be installed.
- WebStorm’s bundled Node runtime can be used if `node` is not available on the terminal `PATH`.

Run verification from WebStorm’s terminal:

```bash
npm test
npx playwright install chromium
npm run test:browser
```

The browser test expects the application to be running at `http://127.0.0.1:3000`.

## Features

- Binance Coin-M continuous-contract candlestick streams.
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

Exchange connection control would remain exchange-specific, for example `/api/v1/binance/connect` and `/api/v1/deribit/connect`.

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

Configuration of this server is stored in [config/binancesocket.json](config/binancesocket.json):

```json
{
  "tickerSymbols": [
    "BTCUSD_PERPETUAL",
    "ETHUSD_PERPETUAL"
  ],
  "historyCandles": 1000,
  "exchangeCandlestickStreamInterval": "1m",
  "initiallyConnected": false
}
```

### Configuration fields

| Field | Description | Example |
| --- | --- | --- |
| `tickerSymbols` | Binance Coin-M continuous contracts | `["BTCUSD_PERPETUAL", "ETHUSD_PERPETUAL"]` |
| `historyCandles` | Maximum number of completed candles to retain in memory | `1000` |
| `exchangeCandlestickStreamInterval` | Exchange candlestick stream input interval | `1m` |
| `initiallyConnected` | Whether the service should connect on startup and remain enabled for reconnects | `true` |

Supported exchange stream intervals include `1s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, and `1M`.

For a continuous contract, the WebSocket URL is generated as:

```text
wss://dstream.binance.com/stream?streams={symbol1}@continuousKline_{interval}/{symbol2}@continuousKline_{interval}
```

For the default configuration:

```text
wss://dstream.binance.com/stream?streams=btcusd_perpetual@continuousKline_1m/ethusd_perpetual@continuousKline_1m
```

`historyCandles` is a candle count. For example, with `historyCandles: 1000`, the service retains at most the latest 1000 completed candles, regardless of the configured interval.

The `initiallyConnected` value is changed automatically by the connect and disconnect endpoints. The status API continues to expose the current runtime state as `connected`.

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

All responses are JSON except the dashboard HTML page and the live Server-Sent Events stream.

### Dashboard

```text
GET /dashboard
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) in a browser. The dashboard provides buttons for connection control and status, displays the current WebSocket URL, and can show a scrolling history of live Binance messages.

### Connect

```text
GET  /binance/connect
POST /binance/connect
```

Enables the service, persists `initiallyConnected: true`, and opens the Binance WebSocket connection. The GET form is provided for convenient use from a browser address bar.

### Disconnect

```text
GET  /binance/disconnect
POST /binance/disconnect
```

Disables the service, persists `initiallyConnected: false`, cancels pending reconnects, and closes the active WebSocket.

### Status

```text
GET /api/v1/binance/status
```

Example response:

```json
{
  "connected": true,
  "socketOpen": true,
  "tickerSymbols": ["BTCUSD_PERPETUAL", "ETHUSD_PERPETUAL"],
  "webSocketUrl": "wss://dstream.binance.com/stream?streams=btcusd_perpetual@continuousKline_1m/ethusd_perpetual@continuousKline_1m",
  "exchangeCandlestickStreamInterval": "1m",
  "historyCandles": 1000,
  "candles": {
    "btcusd": 42,
    "ethusd": 41
  }
}
```

`connected` is the persisted service preference. `socketOpen` indicates whether the underlying WebSocket is currently open; it can be false temporarily while reconnecting.

### Candles

```text
GET /api/v1/binance/candles/btcusd/snapshot
GET /api/v1/binance/candles/ethusd/snapshot?limit=100
GET /api/v1/binance/candles/btcusd/snapshot?aggregation=5m&limit=100
GET /api/v1/binance/candles/btcusd/snapshot?aggregation=15m&includeIncomplete=true
```

The path uses the public symbol portion of any configured continuous contract, lowercased. For `BTCUSD_PERPETUAL`, use `/api/v1/binance/candles/btcusd/snapshot`; for `ETHUSD_PERPETUAL`, use `/api/v1/binance/candles/ethusd/snapshot`.

The optional `limit` parameter returns the newest requested number of candles. It must be a positive integer. The result can never contain more candles than are currently retained in memory.

The optional `aggregation` parameter combines the stored subscription candles into a larger, UTC-aligned interval at request time. For example, `GET /api/v1/binance/candles/btcusd/snapshot?aggregation=5m` combines five closed 1-minute candles into each 5-minute candle. The original subscription candles remain in memory. Only complete aggregation windows are returned; a window with missing source candles is skipped. `aggregation` must be equal to or a multiple of `exchangeCandlestickStreamInterval`; calendar-month aggregation (`1M`) is not supported. The application also supports the custom local aggregation intervals `2m`, `10m`, `20m`, `2d`, `4d`, and `5d`. These are calculated from the stored 1-minute candles and are not Binance-native stream intervals.

Set `includeIncomplete=true` to include the current in-progress aggregate in the HTTP snapshot. It is marked with `candlestickIsClosed: false` and is built from the latest live 1-minute update. It is not added to completed history.

Example candle:

```json
{
  "symbol": "btcusd",
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

Only Binance messages whose kline close flag is true are included. The service does not backfill candles when it starts; history begins accumulating after a connection is established.

### Live socket data

```text
GET /api/v1/binance/live
```

This is a Server-Sent Events endpoint. It forwards incoming Binance WebSocket messages to connected browser clients, including updates for candles that are not yet closed. Each event is sent as a JSON `data:` field.

For server-aggregated live candles, use:

```text
GET /api/v1/binance/candles/btcusd/live?aggregation=15m
```

This keeps an SSE connection open and sends the newest aggregate whenever the selected symbol receives a 1-minute update. The same aggregate is updated by `openTime`; clients should replace an existing chart candle when that timestamp repeats. Updates have `candlestickIsClosed: false` until the 15-minute window completes, then the final update has `candlestickIsClosed: true`.

To receive only one event per completed aggregate, set `includeIncomplete=false`:

```text
GET /api/v1/binance/candles/btcusd/live?aggregation=15m&includeIncomplete=false
```

This mode suppresses the initial snapshot and all in-progress updates. It emits one event when each new aggregated candle closes and ignores duplicate close updates.

Example with curl:

```bash
curl -N http://localhost:3000/api/v1/binance/live
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

Use an uppercase continuous-contract name such as `BTCUSD_PERPETUAL`, a positive integer for `historyCandles`, and one of the supported intervals in `exchangeCandlestickStreamInterval`.

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
