const path = require('node:path');
const fs = require('node:fs');
const { loadStrategy } = require('./strategy-loader');
const StrategyEngine = require('./strategy-engine');
const PaperBroker = require('./paper-broker');
const StrategyRepository = require('./sqlite-repository');

function createStrategyRuntime({ strategyFile, services, dataPath = path.join(__dirname, '..', '..', 'data', 'strategy.sqlite') }) {
  const strategy = loadStrategy(strategyFile);
  if (strategy.instruments.length !== 1) throw new Error('Strategy must define exactly one instrument');
  if (!strategy.enabled) return { strategy, engine: null, broker: null };
  const instrument = strategy.instruments[0];
  const service = Object.values(services).find(candidate => candidate.config.tickerSymbols.some(symbol => symbol.toLowerCase() === instrument));
  if (!service) throw new Error('Strategy instrument must be configured on a Binance service');
  const repository = new StrategyRepository(dataPath);
  const broker = new PaperBroker({ repository, strategyKey: strategy.name + ':v' + strategy.version });
  const engine = new StrategyEngine({ strategy, service, broker, repository });
  engine.start();
  return { strategy, engine, broker, service, repository };
}

function createStrategyRuntimes({ strategiesDirectory = path.join(__dirname, '..', '..', 'strategies'), services, dataPath = path.join(__dirname, '..', '..', 'data', 'strategy.sqlite') }) {
  const files = fs.readdirSync(strategiesDirectory).filter(file => /\.ya?ml$/i.test(file)).sort();
  const runtimes = [];
  const errors = [];
  for (const file of files) {
    try {
      const runtime = createStrategyRuntime({ strategyFile: path.join(strategiesDirectory, file), services, dataPath });
      runtimes.push({ ...runtime, file });
      console.info(runtime.engine ? 'Strategy started:' : 'Strategy disabled:', runtime.strategy.name + ' v' + runtime.strategy.version, 'file=' + file);
    } catch (error) {
      errors.push({ file, error: error.message });
      console.error('Strategy startup failed:', file, error.message);
    }
  }
  return {
    runtimes,
    errors,
    reloadStrategy(file) {
      if (typeof file !== 'string' || path.basename(file) !== file || !/\.ya?ml$/i.test(file)) {
        throw new Error('A strategy YAML filename is required');
      }
      const index = runtimes.findIndex(item => item.file === file);
      if (index < 0) throw new Error('Strategy file is not loaded: ' + file);
      const replacement = createStrategyRuntime({ strategyFile: path.join(strategiesDirectory, file), services, dataPath });
      const previous = runtimes[index];
      if (previous.engine) previous.engine.stop();
      if (previous.repository) previous.repository.close();
      runtimes[index] = { ...replacement, file };
      const errorIndex = errors.findIndex(item => item.file === file);
      if (errorIndex >= 0) errors.splice(errorIndex, 1);
      return runtimes[index];
    }
  };
}

module.exports = { createStrategyRuntime, createStrategyRuntimes, defaultStrategiesDirectory: path.join(__dirname, '..', '..', 'strategies') };
