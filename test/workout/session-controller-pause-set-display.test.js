const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearPoseOverlay,
  resolveDisplayedSetCountOnPause,
} = require('../../public/js/workout/session-controller.js');

test('resolveDisplayedSetCountOnPause increments displayed set count for free workout pauses', () => {
  const next = resolveDisplayedSetCountOnPause({
    mode: 'FREE',
    displayedSetCount: 2,
    phase: 'WORKING',
    nextIsPaused: true,
  });

  assert.equal(next, 3);
});

test('resolveDisplayedSetCountOnPause keeps displayed set count for resume and non-free modes', () => {
  assert.equal(
    resolveDisplayedSetCountOnPause({
      mode: 'FREE',
      displayedSetCount: 2,
      phase: 'PAUSED',
      nextIsPaused: false,
    }),
    2,
  );

  assert.equal(
    resolveDisplayedSetCountOnPause({
      mode: 'ROUTINE',
      displayedSetCount: 2,
      phase: 'WORKING',
      nextIsPaused: true,
    }),
    2,
  );
});

test('clearPoseOverlay delegates canvas clearing to pose engine when available', () => {
  const calls = [];
  const poseCanvas = { id: 'poseCanvas' };
  const poseEngine = {
    clearPose(canvas) {
      calls.push(canvas);
    },
  };

  clearPoseOverlay({ poseEngine, poseCanvas });

  assert.deepEqual(calls, [poseCanvas]);
});

test('clearPoseOverlay clears the canvas directly when pose engine helper is unavailable', () => {
  const calls = [];
  const poseCanvas = {
    width: 640,
    height: 480,
    getContext(type) {
      assert.equal(type, '2d');
      return {
        clearRect(x, y, width, height) {
          calls.push({ x, y, width, height });
        },
      };
    },
  };

  clearPoseOverlay({ poseEngine: null, poseCanvas });

  assert.deepEqual(calls, [{ x: 0, y: 0, width: 640, height: 480 }]);
});
