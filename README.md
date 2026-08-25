# Binance Coin-M Futures WebSocket Service

This is a node.js Express application that connects to Binance Coin-M Futures continuous-contract WebSocket streams (1 second update), keeps closed candlesticks in memory, and exposes them through HTTP and a browser dashboard.

## Current project status

The implementation is complete. The remaining task is to run the automated tests in the local WebStorm environment and resolve any test-only issues that appear.

- Service, configuration, APIs, dashboard, live SSE feed, JSON formatting toggle, and documentation are implemented.
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

- Binance Coin-M continuous-contract kline streams (1 second update).
- Configurable contract symbol, candle interval, and history window.
- Closed candlesticks only (`k.x === true`) are stored and returned to the calling browser.
- In-memory retention based on a configurable number of minutes.
- Automatic reconnect with exponential backoff after unexpected disconnects.
- Persisted connection state in the configuration file.
- HTTP endpoints for connection control, status, candles, and live socket data.
- Browser dashboard with connection controls, live data history, and JSON formatting toggle.

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
  "tickerSymbol": "BTCUSD_PERPETUAL",
  "historyLength": 1000,
  "interval": "1m",
  "connected": false
}
```

### Configuration fields

| Field | Description | Example |
| --- | --- | --- |
| `tickerSymbol` | Binance Coin-M continuous contract | `BTCUSD_PERPETUAL` |
| `historyLength` | Number of minutes to retain in memory | `1000` |
| `interval` | Binance kline interval | `1m` |
| `connected` | Whether the service should connect on startup | `true` |

Supported intervals include `1s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, and `1M`.

For a continuous contract, the WebSocket URL is generated as:

```text
wss://dstream.binance.com/ws/{tickerSymbol}@continuousKline_{interval}
```

For the default configuration:

```text
wss://dstream.binance.com/ws/btcusd_perpetual@continuousKline_1m
```

`historyLength` is measured in minutes, not candle count. For example, with a `5m` interval and a history length of `1000`, candles from approximately the last 1000 minutes are retained.

The `connected` value is changed automatically by the connect and disconnect endpoints. Do not edit it while the application is running unless you understand that the next service action may overwrite the value.

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
GET  /binancesocket/connect
POST /binancesocket/connect
```

Enables the service, persists `connected: true`, and opens the Binance WebSocket connection. The GET form is provided for convenient use from a browser address bar.

### Disconnect

```text
GET  /binancesocket/disconnect
POST /binancesocket/disconnect
```

Disables the service, persists `connected: false`, cancels pending reconnects, and closes the active WebSocket.

### Status

```text
GET /binancesocket/status
```

Example response:

```json
{
  "connected": true,
  "socketOpen": true,
  "tickerSymbol": "BTCUSD_PERPETUAL",
  "webSocketUrl": "wss://dstream.binance.com/ws/btcusd_perpetual@continuousKline_1m",
  "interval": "1m",
  "historyLength": 1000,
  "candles": 42
}
```

`connected` is the persisted service preference. `socketOpen` indicates whether the underlying WebSocket is currently open; it can be false temporarily while reconnecting.

### Candles

```text
GET /btcusd
GET /btcusd?limit=100
```

The path uses the public symbol portion of the configured continuous contract, lowercased. For `BTCUSD_PERPETUAL`, the endpoint is `/btcusd`. If the configured contract changes to `ETHUSD_PERPETUAL`, use `/ethusd`.

The optional `limit` parameter returns the newest requested number of candles. It must be a positive integer. The result can never contain more candles than are currently retained in memory.

Example candle:

```json
{
  "symbol": "btcusd",
  "interval": "1m",
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
GET /binancesocket/live
```

This is a Server-Sent Events endpoint. It forwards incoming Binance WebSocket messages to connected browser clients, including updates for candles that are not yet closed. Each event is sent as a JSON `data:` field.

Example with curl:

```bash
curl -N http://localhost:3000/binancesocket/live
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

Use an uppercase continuous-contract name such as `BTCUSD_PERPETUAL`, a positive integer for `historyLength`, and one of the supported Binance intervals.

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
