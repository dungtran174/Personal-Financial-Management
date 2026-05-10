const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    createConversation,
    getConversations,
    getConversation,
    updateConversation,
    deleteConversation,
    archiveConversation
} = require('../controllers/conversationController');

// All routes require authentication
router.use(protect);

// Conversation CRUD
router.post('/', createConversation);
router.get('/', getConversations);
router.get('/:id', getConversation);
router.put('/:id', updateConversation);
router.delete('/:id', deleteConversation);

// Archive/Unarchive
router.patch('/:id/archive', archiveConversation);

module.exports = router;