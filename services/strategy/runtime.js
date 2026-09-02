const path = require('node:path');
const { loadStrategy } = require('./strategy-loader');
const StrategyEngine = require('./strategy-engine');
const PaperBroker = require('./paper-broker');
const StrategyRepository = require('./sqlite-repository');

function createStrategyRuntime({ strategyFile, services, dataPath = process.env.STRATEGY_DATA_PATH || path.join(__dirname, '..', '..', 'data', 'strategy.sqlite') }) {
  const strategy = loadStrategy(strategyFile);
  if (!strategy.enabled) return { strategy, engine: null, broker: null };
  const instrument = strategy.instruments[0];
  const service = Object.values(services).find(candidate => candidate.config.tickerSymbols.some(symbol => symbol.toLowerCase() === instrument));
  if (!service || strategy.instruments.some(item => !service.config.tickerSymbols.some(symbol => symbol.toLowerCase() === item))) {
    throw new Error('Strategy instruments must be configured on the same Binance service');
  }
  const repository = new StrategyRepository(dataPath);
  const broker = new PaperBroker({ repository });
  const engine = new StrategyEngine({ strategy, service, broker, repository });
  engine.start();
  return { strategy, engine, broker, service, repository };
}

module.exports = { createStrategyRuntime, defaultStrategyFile: path.join(__dirname, '..', '..', 'config', 'strategies', 'sample.yaml') };
