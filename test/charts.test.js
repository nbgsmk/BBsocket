const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('chart page contains data controls and live chart integration', () => {
  const template = fs.readFileSync(require.resolve('../views/charts.ejs'), 'utf8');
  assert.match(template, /id="chart"/);
  assert.match(template, /candles\/snapshot/);
  assert.match(template, /candles\/live/);
  assert.match(template, /payload\.candlestick/);
  assert.match(template, /stopLiveUpdates/);
  assert.match(template, /indicators=/);
  assert.match(template, /openTime/);
  assert.match(template, /indicator/);
  assert.match(template, /strategy-selector/);
  assert.match(template, /api\/v1\/strategy\/status/);
  assert.match(template, /api\/v1\/strategy\/decisions/);
  assert.match(template, /setMarkers/);
  assert.match(template, /selected\.indicators.*join/);
  assert.match(template, /paneIndexes/);
  assert.match(template, /indicator\.placement/);
  assert.match(template, /seriesByKey/);
  assert.match(template, /addSeries\(LightweightCharts\.LineSeries/);
});
