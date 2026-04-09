const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
    getDashboard,
    getExercises,
    createExercise,
    updateExercise,
    deleteExercise,
    getUsers,
    updateUserStatus,
    getQuestTemplates,
    createQuestTemplate,
    updateQuestTemplate,
    deleteQuestTemplate,
    createQuestAssignmentRule,
    updateQuestAssignmentRule,
    deleteQuestAssignmentRule,
    getTierRules,
    upsertTierRule
} = require('../controllers/admin');

// 모든 관리자 라우트에 requireAdmin 미들웨어 적용
router.use(requireAdmin);

// 대시보드
router.get('/', getDashboard);

// 운동 관리
router.get('/exercises', getExercises);
router.post('/exercises', createExercise);
router.post('/exercises/:exercise_id', updateExercise);
router.post('/exercises/:exercise_id/delete', deleteExercise);

// 사용자 관리
router.get('/users', getUsers);
router.post('/users/:user_id/status', updateUserStatus);

// 퀘스트 템플릿 관리
router.get('/quests', getQuestTemplates);
router.post('/quests', createQuestTemplate);
router.post('/quests/rules', createQuestAssignmentRule);
router.post('/quests/rules/:rule_id', updateQuestAssignmentRule);
router.post('/quests/rules/:rule_id/delete', deleteQuestAssignmentRule);
router.post('/quests/:quest_template_id', updateQuestTemplate);
router.post('/quests/:quest_template_id/delete', deleteQuestTemplate);

// 티어 관리
router.get('/tiers', getTierRules);
router.post('/tiers', upsertTierRule);

module.exports = router;
