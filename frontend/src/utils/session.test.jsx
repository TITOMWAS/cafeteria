import { describe, it } from 'vitest';
import assert from 'node:assert';
import { getActiveSession, formatKES, formatDate, STATUS_STYLES, SESSION_SCHEDULE } from './session';
import { renderToStaticMarkup } from 'react-dom/server';
import { HBarChart, DonutChart, StatusBars, TrendChart } from '../components/charts';

describe('getActiveSession', () => {
  const at = (h) => new Date(2026, 0, 15, h, 30);

  it('maps morning hours to breakfast', () => {
    assert.equal(getActiveSession(at(6)), 'breakfast');
    assert.equal(getActiveSession(at(9)), 'breakfast');
  });
  it('maps midday hours to lunch', () => {
    assert.equal(getActiveSession(at(12)), 'lunch');
    assert.equal(getActiveSession(at(14)), 'lunch');
  });
  it('maps evening hours to supper', () => {
    assert.equal(getActiveSession(at(18)), 'supper');
    assert.equal(getActiveSession(at(20)), 'supper');
  });
  it('is closed outside serving windows and between them', () => {
    for (const h of [0, 5, 10, 11, 16, 17, 21, 23]) {
      assert.equal(getActiveSession(at(h)), 'closed');
    }
  });
});

describe('formatKES', () => {
  it('formats amounts with the KES prefix', () => {
    assert.ok(formatKES(1500).startsWith('KES'));
    assert.ok(formatKES(1500).includes('1,500'));
  });
  it('handles zero and string inputs', () => {
    assert.ok(formatKES(0).includes('0'));
    assert.ok(formatKES('200').includes('200'));
  });
});

describe('STATUS_STYLES + SESSION_SCHEDULE integrity', () => {
  it('every order status has a style entry', () => {
    for (const s of ['pending', 'paid', 'preparing', 'ready', 'served', 'expired']) {
      assert.ok(STATUS_STYLES[s], `missing style for ${s}`);
      assert.ok(STATUS_STYLES[s].label);
    }
  });
  it('serves three sessions per day in order', () => {
    assert.deepEqual(SESSION_SCHEDULE.map((s) => s.id), ['breakfast', 'lunch', 'supper']);
  });
});

describe('chart components render (SSR smoke)', () => {
  it('HBarChart renders bars for items', () => {
    const html = renderToStaticMarkup(<HBarChart items={[{ label: 'Pilau', value: 12 }, { label: 'Beans', value: 7 }]} />);
    assert.ok(html.includes('Pilau'));
  });
  it('DonutChart renders legend entries', () => {
    const html = renderToStaticMarkup(<DonutChart segments={[{ label: 'lunch', value: 5, color: '#123' }]} centerLabel="Units" centerValue="5" />);
    assert.ok(html.includes('lunch'));
  });
  it('StatusBars renders nothing harmful when empty', () => {
    const html = renderToStaticMarkup(<StatusBars statusBreakdown={{}} />);
    assert.ok(typeof html === 'string');
  });
  it('TrendChart renders without data', () => {
    const html = renderToStaticMarkup(<TrendChart data={[]} />);
    assert.ok(typeof html === 'string');
  });
});
