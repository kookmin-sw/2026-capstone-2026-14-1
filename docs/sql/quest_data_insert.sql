BEGIN;

-- 운영 중 데이터가 있으면 아래 TRUNCATE는 빼고 사용
-- TRUNCATE TABLE quest_assignment_rule, quest_template RESTART IDENTITY CASCADE;

-- =========================================================
-- quest_template seed
-- condition JSON은 앱에서 해석하는 계약 예시
-- kind 기준으로 판정 로직을 붙이면 됨
-- =========================================================

-- -------------------------
-- DAILY / TIER 1~2
-- -------------------------
INSERT INTO quest_template (
    scope, type, category, difficulty, title, condition,
    reward_points, min_tier, max_tier,
    selection_weight, cooldown_days, exclusive_group, is_active
) VALUES
-- SESSION_COUNT
('DAILY', 'DO', 'SESSION_COUNT', 'EASY',
 '오늘 운동 1회 완료',
 '{"kind":"WORKOUT_SESSION_COUNT","status":"DONE","operator":"GTE","value":1}'::jsonb,
 30, 1, 2, 150, 1, 'DAILY_SESSION_COUNT', TRUE),

('DAILY', 'DO', 'SESSION_COUNT', 'NORMAL',
 '오늘 운동 2회 완료',
 '{"kind":"WORKOUT_SESSION_COUNT","status":"DONE","operator":"GTE","value":2}'::jsonb,
 55, 1, 2, 90, 1, 'DAILY_SESSION_COUNT', TRUE),

-- ROUTINE_COUNT
('DAILY', 'DO', 'ROUTINE_COUNT', 'NORMAL',
 '오늘 루틴 1회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":1}'::jsonb,
 60, 1, 2, 130, 1, 'DAILY_ROUTINE_COUNT', TRUE),

('DAILY', 'DO', 'ROUTINE_COUNT', 'HARD',
 '오늘 루틴 2회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":2}'::jsonb,
 90, 1, 2, 70, 2, 'DAILY_ROUTINE_COUNT', TRUE),

-- SCORE
('DAILY', 'QUALITY', 'SCORE', 'NORMAL',
 '오늘 75점 이상 1회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":75,"occurrences":1}'::jsonb,
 70, 1, 2, 130, 1, 'DAILY_SCORE', TRUE),

('DAILY', 'QUALITY', 'SCORE', 'HARD',
 '오늘 80점 이상 1회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":80,"occurrences":1}'::jsonb,
 100, 1, 2, 80, 1, 'DAILY_SCORE', TRUE),

-- DURATION
('DAILY', 'CHALLENGE', 'DURATION', 'NORMAL',
 '오늘 총 운동 10분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":600}'::jsonb,
 60, 1, 2, 130, 1, 'DAILY_DURATION', TRUE),

('DAILY', 'CHALLENGE', 'DURATION', 'HARD',
 '오늘 총 운동 15분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":900}'::jsonb,
 90, 1, 2, 80, 1, 'DAILY_DURATION', TRUE);

-- -------------------------
-- DAILY / TIER 3~4
-- -------------------------
INSERT INTO quest_template (
    scope, type, category, difficulty, title, condition,
    reward_points, min_tier, max_tier,
    selection_weight, cooldown_days, exclusive_group, is_active
) VALUES
-- SESSION_COUNT
('DAILY', 'DO', 'SESSION_COUNT', 'NORMAL',
 '오늘 운동 2회 완료',
 '{"kind":"WORKOUT_SESSION_COUNT","status":"DONE","operator":"GTE","value":2}'::jsonb,
 70, 3, 4, 140, 1, 'DAILY_SESSION_COUNT', TRUE),

('DAILY', 'DO', 'SESSION_COUNT', 'HARD',
 '오늘 운동 3회 완료',
 '{"kind":"WORKOUT_SESSION_COUNT","status":"DONE","operator":"GTE","value":3}'::jsonb,
 110, 3, 4, 85, 1, 'DAILY_SESSION_COUNT', TRUE),

-- ROUTINE_COUNT
('DAILY', 'DO', 'ROUTINE_COUNT', 'NORMAL',
 '오늘 루틴 1회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":1}'::jsonb,
 90, 3, 4, 120, 1, 'DAILY_ROUTINE_COUNT', TRUE),

('DAILY', 'DO', 'ROUTINE_COUNT', 'HARD',
 '오늘 루틴 2회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":2}'::jsonb,
 140, 3, 4, 75, 2, 'DAILY_ROUTINE_COUNT', TRUE),

-- SCORE
('DAILY', 'QUALITY', 'SCORE', 'NORMAL',
 '오늘 80점 이상 1회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":80,"occurrences":1}'::jsonb,
 110, 3, 4, 130, 1, 'DAILY_SCORE', TRUE),

('DAILY', 'QUALITY', 'SCORE', 'HARD',
 '오늘 85점 이상 2회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":85,"occurrences":2}'::jsonb,
 170, 3, 4, 80, 2, 'DAILY_SCORE', TRUE),

-- DURATION
('DAILY', 'CHALLENGE', 'DURATION', 'NORMAL',
 '오늘 총 운동 20분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":1200}'::jsonb,
 130, 3, 4, 120, 1, 'DAILY_DURATION', TRUE),

('DAILY', 'CHALLENGE', 'DURATION', 'HARD',
 '오늘 총 운동 25분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":1500}'::jsonb,
 180, 3, 4, 75, 1, 'DAILY_DURATION', TRUE);

-- -------------------------
-- DAILY / TIER 5~6
-- -------------------------
INSERT INTO quest_template (
    scope, type, category, difficulty, title, condition,
    reward_points, min_tier, max_tier,
    selection_weight, cooldown_days, exclusive_group, is_active
) VALUES
-- SESSION_COUNT
('DAILY', 'DO', 'SESSION_COUNT', 'HARD',
 '오늘 운동 3회 완료',
 '{"kind":"WORKOUT_SESSION_COUNT","status":"DONE","operator":"GTE","value":3}'::jsonb,
 140, 5, 6, 120, 1, 'DAILY_SESSION_COUNT', TRUE),

('DAILY', 'DO', 'SESSION_COUNT', 'HARD',
 '오늘 운동 4회 완료',
 '{"kind":"WORKOUT_SESSION_COUNT","status":"DONE","operator":"GTE","value":4}'::jsonb,
 200, 5, 6, 75, 2, 'DAILY_SESSION_COUNT', TRUE),

-- ROUTINE_COUNT
('DAILY', 'DO', 'ROUTINE_COUNT', 'NORMAL',
 '오늘 루틴 1회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":1}'::jsonb,
 160, 5, 6, 110, 1, 'DAILY_ROUTINE_COUNT', TRUE),

('DAILY', 'DO', 'ROUTINE_COUNT', 'HARD',
 '오늘 루틴 2회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":2}'::jsonb,
 240, 5, 6, 70, 2, 'DAILY_ROUTINE_COUNT', TRUE),

-- SCORE
('DAILY', 'QUALITY', 'SCORE', 'NORMAL',
 '오늘 85점 이상 1회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":85,"occurrences":1}'::jsonb,
 180, 5, 6, 120, 1, 'DAILY_SCORE', TRUE),

('DAILY', 'QUALITY', 'SCORE', 'HARD',
 '오늘 90점 이상 2회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":90,"occurrences":2}'::jsonb,
 280, 5, 6, 75, 2, 'DAILY_SCORE', TRUE),

-- DURATION
('DAILY', 'CHALLENGE', 'DURATION', 'HARD',
 '오늘 총 운동 30분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":1800}'::jsonb,
 220, 5, 6, 110, 1, 'DAILY_DURATION', TRUE),

('DAILY', 'CHALLENGE', 'DURATION', 'HARD',
 '오늘 총 운동 40분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":2400}'::jsonb,
 320, 5, 6, 65, 2, 'DAILY_DURATION', TRUE);

-- -------------------------
-- WEEKLY / TIER 1~2
-- -------------------------
INSERT INTO quest_template (
    scope, type, category, difficulty, title, condition,
    reward_points, min_tier, max_tier,
    selection_weight, cooldown_days, exclusive_group, is_active
) VALUES
('WEEKLY', 'HABIT', 'ACTIVE_DAYS', 'EASY',
 '이번 주 3일 운동',
 '{"kind":"ACTIVE_DAYS_COUNT","status":"DONE","operator":"GTE","value":3}'::jsonb,
 220, 1, 2, 100, 7, 'WEEKLY_ACTIVE_DAYS', TRUE),

('WEEKLY', 'DO', 'ROUTINE_COUNT', 'NORMAL',
 '이번 주 루틴 3회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":3}'::jsonb,
 260, 1, 2, 100, 7, 'WEEKLY_ROUTINE_COUNT', TRUE),

('WEEKLY', 'QUALITY', 'SCORE', 'NORMAL',
 '이번 주 75점 이상 3회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":75,"occurrences":3}'::jsonb,
 300, 1, 2, 100, 7, 'WEEKLY_SCORE', TRUE),

('WEEKLY', 'CHALLENGE', 'DURATION', 'HARD',
 '이번 주 총 운동 60분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":3600}'::jsonb,
 340, 1, 2, 100, 7, 'WEEKLY_DURATION', TRUE);

-- -------------------------
-- WEEKLY / TIER 3~4
-- -------------------------
INSERT INTO quest_template (
    scope, type, category, difficulty, title, condition,
    reward_points, min_tier, max_tier,
    selection_weight, cooldown_days, exclusive_group, is_active
) VALUES
('WEEKLY', 'HABIT', 'ACTIVE_DAYS', 'NORMAL',
 '이번 주 4일 운동',
 '{"kind":"ACTIVE_DAYS_COUNT","status":"DONE","operator":"GTE","value":4}'::jsonb,
 420, 3, 4, 100, 7, 'WEEKLY_ACTIVE_DAYS', TRUE),

('WEEKLY', 'DO', 'ROUTINE_COUNT', 'NORMAL',
 '이번 주 루틴 5회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":5}'::jsonb,
 560, 3, 4, 100, 7, 'WEEKLY_ROUTINE_COUNT', TRUE),

('WEEKLY', 'QUALITY', 'SCORE', 'HARD',
 '이번 주 85점 이상 4회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":85,"occurrences":4}'::jsonb,
 620, 3, 4, 100, 7, 'WEEKLY_SCORE', TRUE),

('WEEKLY', 'CHALLENGE', 'DURATION', 'HARD',
 '이번 주 총 운동 120분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":7200}'::jsonb,
 720, 3, 4, 100, 7, 'WEEKLY_DURATION', TRUE);

-- -------------------------
-- WEEKLY / TIER 5~6
-- -------------------------
INSERT INTO quest_template (
    scope, type, category, difficulty, title, condition,
    reward_points, min_tier, max_tier,
    selection_weight, cooldown_days, exclusive_group, is_active
) VALUES
('WEEKLY', 'HABIT', 'ACTIVE_DAYS', 'HARD',
 '이번 주 5일 운동',
 '{"kind":"ACTIVE_DAYS_COUNT","status":"DONE","operator":"GTE","value":5}'::jsonb,
 900, 5, 6, 100, 7, 'WEEKLY_ACTIVE_DAYS', TRUE),

('WEEKLY', 'DO', 'ROUTINE_COUNT', 'HARD',
 '이번 주 루틴 7회 완료',
 '{"kind":"ROUTINE_COMPLETE_COUNT","status":"DONE","operator":"GTE","value":7}'::jsonb,
 1200, 5, 6, 100, 7, 'WEEKLY_ROUTINE_COUNT', TRUE),

('WEEKLY', 'QUALITY', 'SCORE', 'HARD',
 '이번 주 90점 이상 5회 달성',
 '{"kind":"SESSION_SCORE_COUNT","status":"DONE","operator":"GTE","min_score":90,"occurrences":5}'::jsonb,
 1500, 5, 6, 100, 7, 'WEEKLY_SCORE', TRUE),

('WEEKLY', 'CHALLENGE', 'DURATION', 'HARD',
 '이번 주 총 운동 180분 달성',
 '{"kind":"TOTAL_SESSION_DURATION_SEC","status":"DONE","operator":"GTE","value":10800}'::jsonb,
 1800, 5, 6, 100, 7, 'WEEKLY_DURATION', TRUE);

-- =========================================================
-- quest_assignment_rule seed
-- 슬롯은 family 단위로 고정
-- count=1로 두고 같은 family 안에서 템플릿 랜덤 선발
-- =========================================================

INSERT INTO quest_assignment_rule (
    scope, slot_no, category, type, count, min_tier, max_tier, is_active
) VALUES
-- DAILY / 1~2
('DAILY', 1, 'SESSION_COUNT', 'DO',        1, 1, 2, TRUE),
('DAILY', 2, 'ROUTINE_COUNT', 'DO',        1, 1, 2, TRUE),
('DAILY', 3, 'SCORE',         'QUALITY',   1, 1, 2, TRUE),
('DAILY', 4, 'DURATION',      'CHALLENGE', 1, 1, 2, TRUE),

-- DAILY / 3~4
('DAILY', 1, 'SESSION_COUNT', 'DO',        1, 3, 4, TRUE),
('DAILY', 2, 'ROUTINE_COUNT', 'DO',        1, 3, 4, TRUE),
('DAILY', 3, 'SCORE',         'QUALITY',   1, 3, 4, TRUE),
('DAILY', 4, 'DURATION',      'CHALLENGE', 1, 3, 4, TRUE),

-- DAILY / 5~6
('DAILY', 1, 'SESSION_COUNT', 'DO',        1, 5, 6, TRUE),
('DAILY', 2, 'ROUTINE_COUNT', 'DO',        1, 5, 6, TRUE),
('DAILY', 3, 'SCORE',         'QUALITY',   1, 5, 6, TRUE),
('DAILY', 4, 'DURATION',      'CHALLENGE', 1, 5, 6, TRUE),

-- WEEKLY / 1~2
('WEEKLY', 1, 'ACTIVE_DAYS',  'HABIT',     1, 1, 2, TRUE),
('WEEKLY', 2, 'ROUTINE_COUNT','DO',        1, 1, 2, TRUE),
('WEEKLY', 3, 'SCORE',        'QUALITY',   1, 1, 2, TRUE),
('WEEKLY', 4, 'DURATION',     'CHALLENGE', 1, 1, 2, TRUE),

-- WEEKLY / 3~4
('WEEKLY', 1, 'ACTIVE_DAYS',  'HABIT',     1, 3, 4, TRUE),
('WEEKLY', 2, 'ROUTINE_COUNT','DO',        1, 3, 4, TRUE),
('WEEKLY', 3, 'SCORE',        'QUALITY',   1, 3, 4, TRUE),
('WEEKLY', 4, 'DURATION',     'CHALLENGE', 1, 3, 4, TRUE),

-- WEEKLY / 5~6
('WEEKLY', 1, 'ACTIVE_DAYS',  'HABIT',     1, 5, 6, TRUE),
('WEEKLY', 2, 'ROUTINE_COUNT','DO',        1, 5, 6, TRUE),
('WEEKLY', 3, 'SCORE',        'QUALITY',   1, 5, 6, TRUE),
('WEEKLY', 4, 'DURATION',     'CHALLENGE', 1, 5, 6, TRUE);

COMMIT;