const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadStrategy } = require('../services/strategy/strategy-loader');

function temporaryStrategy(source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-'));
  const filePath = path.join(directory, 'strategy.yaml');
  fs.writeFileSync(filePath, source);
  return { directory, filePath };
}

const valid = `
name: test-strategy
version: 1
enabled: true
instruments: [BTCUSDT]
aggregation: 15m
indicators: [sma:20, volumeSma:20]
entry:
  all:
    - left: price.close
      operator: ">"
      right: indicator.sma:20
exit:
  left: price.close
  operator: "<"
  right: indicator.sma:20
`;

test('loads and normalizes a YAML strategy', () => {
  const { directory, filePath } = temporaryStrategy(valid);
  const strategy = loadStrategy(filePath);
  assert.equal(strategy.name, 'test-strategy');
  assert.deepEqual(strategy.instruments, ['btcusdt']);
  assert.deepEqual(strategy.indicators, ['sma:20', 'volumeSma:20']);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('rejects malformed strategies', () => {
  const { directory, filePath } = temporaryStrategy('name: missing-fields\n');
  assert.throws(() => loadStrategy(filePath), /version must be a positive integer/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('rejects invalid indicators and operators', () => {
  const invalidIndicator = valid.replace('sma:20, volumeSma:20', 'unknown:20');
  const invalidOperator = valid.replace('operator: ">"', 'operator: "??"');
  for (const source of [invalidIndicator, invalidOperator]) {
    const { directory, filePath } = temporaryStrategy(source);
    assert.throws(() => loadStrategy(filePath), /Invalid strategy/);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
