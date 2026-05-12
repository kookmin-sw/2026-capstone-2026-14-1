(function () {
  'use strict';

  // DOM refs
  const $ = (id) => document.getElementById(id);
  const loadingEl = $('report-loading');
  const emptyEl = $('report-empty');
  const errorEl = $('report-error');
  const errorMsgEl = $('report-error-msg');
  const retryBtn = $('report-retry-btn');
  const contentEl = $('report-content');
  const dateEl = $('report-date');
  const sourceEl = $('report-source');
  const rangeEl = $('report-range');
  const summaryEl = $('report-summary');
  const improvementsEl = $('report-improvements');
  const weakpointsEl = $('report-weakpoints');
  const improvementsSection = $('report-improvements-section');
  const weakpointsSection = $('report-weakpoints-section');
  const missionTitleEl = $('report-mission-title');
  const missionActionEl = $('report-mission-action');
  const qualityBadgeEl = $('report-quality-badge');
  const qualityMsgEl = $('report-quality-msg');
  const coachCommentEl = $('report-coach-comment');
  const generateBtn = $('report-generate-btn');
  const exerciseSelect = $('report-exercise');
  const periodSelect = $('report-period');

  // --- 상태 ---
  let isLoading = false;

  // --- 유틸 ---
  function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function resetUI() {
    loadingEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }

  function showLoading() {
    isLoading = true;
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<div class="btn-spinner"></div> 생성 중...';
  }

  function showError(msg) {
    isLoading = false;
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorMsgEl.textContent = msg || '리포트를 불러올 수 없습니다.';
    contentEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg> 분석 시작`;
  }

  function showContent() {
    isLoading = false;
    loadingEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="M21 2v6h-6M3 12a9 9 0 0 1 15.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 0 1-15.36 6.36L3 16"/>
    </svg> 재생성`;
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function exerciseLabel(key) {
    const map = { squat: '스쿼트', push_up: '푸쉬업', plank: '플랭크', all: '전체' };
    return map[key] || key;
  }

  function periodLabel(key) {
    const map = { recent_3: '최근 3회', recent_5: '최근 5회', recent_10: '최근 10회', last_7_days: '최근 7일', last_30_days: '최근 30일' };
    return map[key] || key;
  }

  // --- 아이템 렌더러 ---
  function renderItem(item, index) {
    if (typeof item === 'string') {
      return `<div class="section-item">
        <span class="item-num">${index + 1}</span>
        <div class="item-body">
          <p class="item-text">${escapeHtml(item)}</p>
        </div>
      </div>`;
    }
    const title = item.title || item.metric_name || '—';
    const desc = item.evidence || item.description || item.meaning || '';
    return `<div class="section-item">
      <span class="item-num">${index + 1}</span>
      <div class="item-body">
        <p class="item-title">${escapeHtml(title)}</p>
        ${desc ? `<p class="item-desc">${escapeHtml(desc)}</p>` : ''}
      </div>
    </div>`;
  }

  // --- 리포트 렌더링 ---
  function renderReport(data) {
    if (!data) return;

    summaryEl.textContent = data.summary || '';

    if (data.improvements && data.improvements.length > 0) {
      improvementsSection.classList.remove('hidden');
      improvementsEl.innerHTML = data.improvements.map(renderItem).join('');
    } else {
      improvementsSection.classList.add('hidden');
    }

    if (data.weak_points && data.weak_points.length > 0) {
      weakpointsSection.classList.remove('hidden');
      weakpointsEl.innerHTML = data.weak_points.map(renderItem).join('');
    } else {
      weakpointsSection.classList.add('hidden');
    }

    const mission = data.next_mission || {};
    missionTitleEl.textContent = mission.title || mission.metric_name || '운동 자세 유지하기';
    const actionText = mission.action || mission.recommended_cues?.join(', ') || mission.reason || '천천히 자세에 집중하며 운동해보세요.';
    missionActionEl.textContent = actionText;

    const quality = data.data_quality_note || {};
    const label = quality.label || quality.confidence_label || 'medium';
    const note = quality.message || quality.note || '';
    qualityBadgeEl.textContent = label === 'high' ? '양호' : label === 'medium' ? '보통' : '낮음';
    qualityBadgeEl.className = 'quality-badge ' + label;
    qualityMsgEl.textContent = note;

    coachCommentEl.textContent = data.coach_comment || '';
  }

  // --- 리포트 생성 ---
  async function generateReport(exercise, period) {
    showLoading();

    try {
      const url = `/api/users/me/coach-report?exercise=${encodeURIComponent(exercise)}&period=${encodeURIComponent(period)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`API 오류 (${res.status}): ${text.slice(0, 100)}`);
      }
      const response = await res.json();

      dateEl.textContent = formatDate(response.createdAt);
      sourceEl.textContent = response.isFallback ? '기록 기반 분석' : 'AI 분석';
      sourceEl.className = 'meta-badge source-badge ' + (response.isFallback ? 'fallback' : 'ai');
      rangeEl.textContent = `${exerciseLabel(response.exercise || exercise)} · ${periodLabel(response.period || period)}`;

      renderReport(response.result);
      showContent();
    } catch (err) {
      console.error('Report generation error:', err);
      showError(err.message);
    }
  }

  // --- 이벤트 바인딩 ---
  function init() {
    // 최초 진입: 빈 상태
    resetUI();

    // 분석 시작 / 재생성 버튼
    generateBtn.addEventListener('click', () => {
      if (isLoading) return;
      const exercise = exerciseSelect.value;
      const period = periodSelect.value;
      generateReport(exercise, period);
    });

    // 에러 시 재시도
    retryBtn.addEventListener('click', () => {
      if (isLoading) return;
      const exercise = exerciseSelect.value;
      const period = periodSelect.value;
      generateReport(exercise, period);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
