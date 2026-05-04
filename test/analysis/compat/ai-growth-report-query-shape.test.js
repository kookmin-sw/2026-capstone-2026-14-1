const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('current session_event schema is session-scoped, not user-scoped report cache', () => {
  const schema = readRepoFile('docs/sql/DB_init.sql');
  const sessionEventBlock = schema.match(/CREATE TABLE session_event \([\s\S]*?\n\);/)?.[0] || '';

  assert.match(sessionEventBlock, /session_id BIGINT NOT NULL/);
  assert.match(sessionEventBlock, /event_time TIMESTAMPTZ/);
  assert.doesNotMatch(sessionEventBlock, /\buser_id\b/);
  assert.doesNotMatch(sessionEventBlock, /\boccurred_at\b/);
});

test('existing history code reads metrics through session_snapshot_id', () => {
  const historyController = readRepoFile('controllers/history.js');

  assert.match(historyController, /\.from\('session_snapshot'\)/);
  assert.match(historyController, /\.from\('session_snapshot_metric'\)/);
  assert.match(historyController, /\.in\('session_snapshot_id',/);
  assert.doesNotMatch(historyController, /\.from\('session_snapshot_metric'\)[\s\S]{0,160}\.in\('session_id',/);
});