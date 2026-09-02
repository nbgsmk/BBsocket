var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var BinanceSocket = require('./services/exchanges/binance/service').BinanceSocket;
var createApiV1Routes = require('./routes/api/v1');
var dashboardRouter = require('./routes/dashboard');
var chartsRouter = require('./routes/charts');
var { createStrategyRuntime, defaultStrategyFile } = require('./services/strategy/runtime');

var app = express();
var binanceCoinMSocket = new BinanceSocket({ marketType: 'coin-m' });
var binanceUsdMSocket = new BinanceSocket({ marketType: 'usd-m' });
var strategyRuntime;
try {
  strategyRuntime = createStrategyRuntime({ strategyFile: process.env.STRATEGY_FILE || defaultStrategyFile, services: { coinM: binanceCoinMSocket, usdM: binanceUsdMSocket } });
  if (strategyRuntime.strategy) {
    console.info('Strategy loaded:', strategyRuntime.strategy.name + ' v' + strategyRuntime.strategy.version,
      'enabled=' + strategyRuntime.strategy.enabled,
      'instruments=' + strategyRuntime.strategy.instruments.join(','),
      'aggregation=' + strategyRuntime.strategy.aggregation);
  }
} catch (error) {
  console.error('Strategy startup failed:', error.message);
  strategyRuntime = { strategy: null, engine: null, broker: null };
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/dashboard', dashboardRouter);
app.use('/charts', chartsRouter);
app.use('/users', usersRouter);
app.use('/api/v1', createApiV1Routes({ coinM: binanceCoinMSocket, usdM: binanceUsdMSocket, strategy: strategyRuntime }));

binanceCoinMSocket.initialize();
binanceUsdMSocket.initialize();

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
