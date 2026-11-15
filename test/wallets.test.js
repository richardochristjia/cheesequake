import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWallets } from '../src/wallets.js';

const A = 'A'.repeat(4) + '1'.repeat(36);
const B = 'B'.repeat(4) + '2'.repeat(36);

test('bad line skipped with warning, comment and duplicate handled', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'cq-')), 'w.txt');
  writeFileSync(p, `# comment\n${A},whale\nnot-an-address\n${A},dup\n${B} # inline\n\n`);
  const warns = [];
  const list = loadWallets(p, (m) => warns.push(m));
  assert.deepEqual(list, [{ address: A, label: 'whale' }, { address: B, label: null }]);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /line 3/);
});

test('missing file gives empty list and one warning', () => {
  const warns = [];
  assert.deepEqual(loadWallets('/nonexistent/w.txt', (m) => warns.push(m)), []);
  assert.equal(warns.length, 1);
});
