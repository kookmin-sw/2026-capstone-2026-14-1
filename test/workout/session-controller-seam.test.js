const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../../public/js/workout/session-controller.js');
const helperPath = require.resolve('../../public/js/workout/quality-gate-session.js');

test('session-controller loads the adjacent quality-gate module without ambient globals', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'SessionQualityGate');

  delete require.cache[controllerPath];
  delete require.cache[helperPath];

  Object.defineProperty(globalThis, 'SessionQualityGate', {
    configurable: true,
    get() {
      throw new Error('ambient global should not be read');
    },
  });

  try {
    const controller = require('../../public/js/workout/session-controller.js');

    assert.deepEqual(Object.keys(controller), ['initSession']);
    assert.equal(typeof controller.initSession, 'function');
    assert.equal(typeof require('../../public/js/workout/quality-gate-session.js').mapWithholdReasonToMessage, 'function');
  } finally {
    delete require.cache[controllerPath];
    delete require.cache[helperPath];

    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'SessionQualityGate', originalDescriptor);
    } else {
      delete globalThis.SessionQualityGate;
    }
  }
});
