const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    sendMessage,
    streamMessage,
    getMessages,
    deleteMessage
} = require('../controllers/messageController');

// All routes require authentication
router.use(protect);

// Message operations
router.post('/:id/messages', sendMessage);
router.post('/:id/messages/stream', streamMessage);
router.get('/:id/messages', getMessages);
router.delete('/:id/messages/:messageId', deleteMessage);

module.exports = router;