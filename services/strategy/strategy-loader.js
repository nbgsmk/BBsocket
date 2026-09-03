const fs = require('node:fs');
const YAML = require('yaml');
const { parseIndicatorSpecifications } = require('../market-data/indicator-registry');
const { normalizeCondition } = require('./condition-normalizer');

const AGGREGATIONS = new Set(['1s', '1m', '2m', '3m', '5m', '10m', '15m', '20m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '2d', '3d', '4d', '5d', '1w']);
const OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=', 'between', 'crossesAbove', 'crossesBelow']);

function fail(message) {
  throw new Error('Invalid strategy: ' + message);
}

function validateCondition(condition, path) {
  try { condition = normalizeCondition(condition); }
  catch (error) { fail(path + ' ' + error.message.toLowerCase()); }
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) fail(path + ' must be an object');
  const logicalKeys = ['matchAll', 'matchAny'];
  for (const key of logicalKeys) {
    if (condition[key] !== undefined) {
      if (!Array.isArray(condition[key]) || condition[key].length === 0) fail(path + '.' + key + ' must be a non-empty array');
      condition[key].forEach((child, index) => validateCondition(child, path + '.' + key + '[' + index + ']'));
      return;
    }
  }
  if (condition.not !== undefined) {
    validateCondition(condition.not, path + '.not');
    return;
  }
  if (typeof condition.left !== 'string' || !condition.left.trim()) fail(path + '.left must be a non-empty reference');
  if (!OPERATORS.has(condition.operator)) fail(path + '.operator is unsupported');
  if (condition.right === undefined && condition.value === undefined) fail(path + ' requires right or value');
  if (condition.operator === 'between' && (!Array.isArray(condition.value) || condition.value.length !== 2)) {
    fail(path + '.value must contain exactly two values for between');
  }
}

function validateStrategy(strategy) {
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) fail('root must be an object');
  if (typeof strategy.name !== 'string' || !strategy.name.trim()) fail('name must be a non-empty string');
  if (!Number.isInteger(strategy.version) || strategy.version < 1) fail('version must be a positive integer');
  if (typeof strategy.enabled !== 'boolean') fail('enabled must be boolean');
  if (!Array.isArray(strategy.instruments) || strategy.instruments.length === 0 || strategy.instruments.some(item => typeof item !== 'string' || !item.trim())) fail('instruments must be a non-empty string array');
  if (typeof strategy.aggregation !== 'string' || !AGGREGATIONS.has(strategy.aggregation)) fail('aggregation is unsupported');
  if (!Array.isArray(strategy.indicators)) fail('indicators must be an array');
  const aliases = new Set();
  try {
    strategy.indicators.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) fail('indicators[' + index + '] must define name and indicator');
      if (typeof item.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(item.name)) fail('indicators[' + index + '].name is invalid');
      if (aliases.has(item.name)) fail('indicator alias must be unique: ' + item.name);
      aliases.add(item.name);
      if (typeof item.indicator !== 'string' || !item.indicator.trim()) fail('indicators[' + index + '].indicator must be a specification');
      parseIndicatorSpecifications(item.indicator);
    });
  } catch (error) { fail(error.message.replace(/^Invalid strategy: /, '')); }
  validateCondition(strategy.positionEntry, 'positionEntry');
  validateCondition(strategy.positionExit, 'positionExit');
  if (strategy.trade !== undefined && (typeof strategy.trade !== 'object' || typeof strategy.trade.side !== 'string' || typeof strategy.trade.size !== 'number' || strategy.trade.size <= 0)) fail('trade must define a positive numeric size and side');
  return {
    ...strategy,
    name: strategy.name.trim(),
    instruments: strategy.instruments.map(instrument => instrument.trim().toLowerCase()),
    indicators: strategy.indicators.map(item => ({ name: item.name.trim(), indicator: item.indicator.trim().toLowerCase() }))
  };
}

function loadStrategy(filePath) {
  let source;
  try { source = fs.readFileSync(filePath, 'utf8'); }
  catch (error) { throw new Error('Unable to read strategy file: ' + error.message); }
  let strategy;
  try { strategy = YAML.parse(source); }
  catch (error) { throw new Error('Unable to parse strategy YAML: ' + error.message); }
  return validateStrategy(strategy);
}

module.exports = { loadStrategy, validateStrategy };
