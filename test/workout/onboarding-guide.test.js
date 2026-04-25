const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getWorkoutOnboardingSlides,
  normalizeOnboardingExerciseCode,
} = require('../../public/js/workout/onboarding-guide.js');

test('normalizes pushup aliases for onboarding image paths', () => {
  assert.equal(normalizeOnboardingExerciseCode('pushup'), 'push-up');
  assert.equal(normalizeOnboardingExerciseCode('push-up'), 'push-up');
  assert.equal(normalizeOnboardingExerciseCode(' SQUAT '), 'squat');
});

test('builds squat onboarding slides with camera setup first', () => {
  const slides = getWorkoutOnboardingSlides({ exerciseCode: 'squat' });

  assert.equal(slides.length, 4);
  assert.equal(slides[0].key, 'camera-setup');
  assert.match(slides[0].title, /카메라/);
  assert.match(slides[0].imageSrc, /\/images\/workout-guides\/squat\/camera-setup\.png$/);
  assert.ok(slides[0].bullets.some((text) => text.includes('전신')));

  assert.equal(slides[1].key, 'good-form');
  assert.match(slides[1].title, /좋은 자세/);
  assert.ok(slides[1].bullets.some((text) => text.includes('어깨너비')));

  assert.equal(slides[2].key, 'caution-form');
  assert.match(slides[2].title, /주의/);
  assert.ok(slides[2].bullets.some((text) => text.includes('무릎')));

  assert.equal(slides[3].key, 'ready-check');
  assert.match(slides[3].title, /시작 전 확인/);
  assert.ok(slides[3].bullets.some((text) => text.includes('5초')));
});

test('falls back to generic slides for unknown exercises', () => {
  const slides = getWorkoutOnboardingSlides({ exerciseCode: 'unknown-code' });

  assert.equal(slides.length, 4);
  assert.match(slides[1].title, /좋은 자세/);
  assert.ok(slides[1].bullets.some((text) => text.includes('전신')));
  assert.match(slides[1].imageSrc, /\/images\/workout-guides\/unknown-code\/good-form\.png$/);
});
