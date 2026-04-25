const express = require('express');
const router = express.Router();
const { getTtsModels, textToSpeech } = require('../controllers/tts');

router.get('/models', getTtsModels);
router.post('/', textToSpeech);

module.exports = router;
