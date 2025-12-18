import express from 'express';
import {
  createAgent,
  getAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  getPendingEnquiries,
  approveAgent,
  rejectAgent,
  getAgentsByStatus,
  testEmailConnection,
  agentLogin
} from '../controllers/agent.controller.js';

const router = express.Router();

// Test email route should come before any routes with parameters
router.post('/test-email', testEmailConnection);

// Agent login
router.post('/login', agentLogin);

// Create new agent
router.post('/create', createAgent);

// Get all agents
router.get('/all', getAgents);

// Get pending enquiries
router.get('/enquiries/pending', getPendingEnquiries);

// Get agents by status
router.get('/status/:status', getAgentsByStatus);

// Routes with ID parameter should come last
router.get('/:id', getAgentById);
router.patch('/:id', updateAgent);
router.delete('/:id', deleteAgent);
router.patch('/:id/approve', approveAgent);
router.patch('/:id/reject', rejectAgent);

export default router; 