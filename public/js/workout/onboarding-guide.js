/**
 * workout onboarding guide data + modal controller.
 * Browser에서는 window.WorkoutOnboardingGuide에 붙고,
 * Node 테스트에서는 CommonJS export로 사용한다.
 */
function normalizeOnboardingExerciseCode(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  if (normalized === 'pushup' || normalized === 'push-up') return 'push-up';
  return normalized || 'default';
}

const CAMERA_SETUP_BULLETS = [
  '전신이 화면 안에 들어오도록 카메라를 충분히 멀리 둡니다.',
  '카메라는 몸의 정면 또는 선택한 채점 자세 방향에 맞춥니다.',
  '발끝부터 머리까지 잘리지 않게 화면 중앙에 섭니다.',
  '조명이 너무 어둡거나 역광이면 인식이 불안정할 수 있습니다.',
  '주변에 부딪힐 물건이 없는지 확인합니다.',
];

const READY_CHECK_BULLETS = [
  '전신이 화면에 들어왔는지 확인하세요.',
  '주변에 부딪힐 물건이 없는지 확인하세요.',
  '조명이 충분하고 몸이 잘 보이는지 확인하세요.',
  '선택한 채점 자세에 맞게 서 주세요.',
  '운동 시작 버튼을 누르면 5초 뒤 채점이 시작됩니다.',
];

const EXERCISE_FORM_COPY = {
  squat: {
    good: [
      '발은 어깨너비 정도로 벌립니다.',
      '무릎은 발끝 방향과 비슷하게 향하게 합니다.',
      '엉덩이를 뒤로 빼며 앉습니다.',
      '가능한 범위에서 허벅지가 바닥과 가까워지도록 내려갑니다.',
      '일어날 때 무릎과 엉덩이가 함께 펴지도록 합니다.',
    ],
    caution: [
      '무릎이 안쪽으로 모이지 않게 합니다.',
      '상체가 과도하게 앞으로 숙여지지 않게 합니다.',
      '뒤꿈치가 들리지 않게 합니다.',
      '너무 얕게 앉으면 반복 인식이 부정확할 수 있습니다.',
      '화면에서 발이나 머리가 잘리면 자세 판정이 불안정할 수 있습니다.',
    ],
  },
  'push-up': {
    good: [
      '손은 어깨보다 약간 넓게 둡니다.',
      '머리부터 발끝까지 몸통을 일직선으로 유지합니다.',
      '팔꿈치를 굽혀 가슴이 바닥에 가까워질 때까지 내려갑니다.',
      '올라올 때 몸 전체가 함께 움직이게 합니다.',
    ],
    caution: [
      '허리가 처지거나 엉덩이가 과하게 들리지 않게 합니다.',
      '목만 앞으로 빼지 않습니다.',
      '팔을 너무 좁거나 넓게 짚지 않습니다.',
      '내려가는 깊이가 너무 얕으면 반복 인식이 부정확할 수 있습니다.',
    ],
  },
  plank: {
    good: [
      '팔꿈치는 어깨 아래에 위치시킵니다.',
      '머리, 등, 엉덩이, 발뒤꿈치가 일직선이 되게 합니다.',
      '복부에 힘을 주고 자세를 유지합니다.',
      '목표 시간 동안 호흡을 유지합니다.',
    ],
    caution: [
      '허리가 아래로 처지지 않게 합니다.',
      '엉덩이가 과하게 위로 들리지 않게 합니다.',
      '어깨가 팔꿈치보다 너무 앞이나 뒤로 밀리지 않게 합니다.',
      '화면에서 몸 일부가 잘리면 자세 판정이 부정확할 수 있습니다.',
    ],
  },
  default: {
    good: [
      '전신이 화면에 잘 들어오게 위치를 조정하세요.',
      '선택한 채점 자세에 맞게 몸을 카메라 방향으로 맞추세요.',
      '천천히 정확한 자세로 움직이세요.',
    ],
    caution: [
      '화면 밖으로 몸이 벗어나지 않게 하세요.',
      '너무 빠르게 움직이면 인식이 불안정할 수 있습니다.',
      '주변에 부딪힐 물건이 없는지 확인하세요.',
    ],
  },
};

function buildImageSrc(exerciseCode, slideKey) {
  return `/images/workout-guides/${exerciseCode}/${slideKey}.png`;
}

function getWorkoutOnboardingSlides({ exerciseCode }) {
  const normalizedCode = normalizeOnboardingExerciseCode(exerciseCode);
  const copy = EXERCISE_FORM_COPY[normalizedCode] || EXERCISE_FORM_COPY.default;

  return [
    {
      key: 'camera-setup',
      title: '카메라 세팅법',
      imageSrc: buildImageSrc(normalizedCode, 'camera-setup'),
      imageAlt: '카메라 세팅 예시 이미지',
      bullets: CAMERA_SETUP_BULLETS,
    },
    {
      key: 'good-form',
      title: '좋은 자세',
      imageSrc: buildImageSrc(normalizedCode, 'good-form'),
      imageAlt: '좋은 자세 예시 이미지',
      bullets: copy.good,
    },
    {
      key: 'caution-form',
      title: '주의할 자세',
      imageSrc: buildImageSrc(normalizedCode, 'caution-form'),
      imageAlt: '주의할 자세 예시 이미지',
      bullets: copy.caution,
    },
    {
      key: 'ready-check',
      title: '시작 전 확인',
      imageSrc: buildImageSrc(normalizedCode, 'ready-check'),
      imageAlt: '운동 시작 전 확인 예시 이미지',
      bullets: READY_CHECK_BULLETS,
    },
  ];
}

function createWorkoutOnboardingController({ refs, slides }) {
  let currentIndex = 0;
  const safeSlides = Array.isArray(slides) && slides.length > 0 ? slides : [];

  function close() {
    if (refs.modal) refs.modal.hidden = true;
  }

  function render() {
    if (!safeSlides.length) return;
    const slide = safeSlides[currentIndex];

    if (refs.titleEl) refs.titleEl.textContent = slide.title;
    if (refs.progressEl) refs.progressEl.textContent = `${currentIndex + 1} / ${safeSlides.length}`;
    if (refs.bulletsEl) {
      refs.bulletsEl.innerHTML = '';
      slide.bullets.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        refs.bulletsEl.appendChild(li);
      });
    }

    if (refs.imageEl && refs.imagePlaceholderEl) {
      refs.imageEl.hidden = true;
      refs.imageEl.src = slide.imageSrc;
      refs.imageEl.alt = slide.imageAlt;
      refs.imagePlaceholderEl.hidden = false;
    }

    if (refs.prevBtn) refs.prevBtn.disabled = currentIndex === 0;
    if (refs.nextBtn) {
      const isLast = currentIndex === safeSlides.length - 1;
      refs.nextBtn.textContent = isLast ? '시작 준비 완료' : '›';
      refs.nextBtn.setAttribute('aria-label', isLast ? '온보딩 닫기' : '다음 안내');
    }
  }

  function open() {
    if (!refs.modal || !safeSlides.length) return;
    currentIndex = 0;
    refs.modal.hidden = false;
    render();
  }

  function next() {
    if (currentIndex >= safeSlides.length - 1) {
      close();
      return;
    }
    currentIndex += 1;
    render();
  }

  function prev() {
    currentIndex = Math.max(0, currentIndex - 1);
    render();
  }

  if (refs.nextBtn) refs.nextBtn.addEventListener('click', next);
  if (refs.prevBtn) refs.prevBtn.addEventListener('click', prev);
  if (refs.closeBtn) refs.closeBtn.addEventListener('click', close);
  if (refs.imageEl) {
    refs.imageEl.addEventListener('load', () => {
      refs.imageEl.hidden = false;
      if (refs.imagePlaceholderEl) refs.imagePlaceholderEl.hidden = true;
    });
    refs.imageEl.addEventListener('error', () => {
      refs.imageEl.hidden = true;
      if (refs.imagePlaceholderEl) refs.imagePlaceholderEl.hidden = false;
    });
  }

  return { open, close, next, prev, render };
}

const WorkoutOnboardingGuide = {
  normalizeOnboardingExerciseCode,
  getWorkoutOnboardingSlides,
  createWorkoutOnboardingController,
};

if (typeof window !== 'undefined') {
  window.WorkoutOnboardingGuide = WorkoutOnboardingGuide;
}

if (typeof module !== 'undefined') {
  module.exports = WorkoutOnboardingGuide;
}
