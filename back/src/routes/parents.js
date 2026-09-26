const express = require('express');
const parentController = require('../controllers/parentController');

const router = express.Router();

router.get('/', parentController.getAllParents);
router.get('/report-logs', parentController.getReportLogs);
router.post('/reports/:reportType/send', parentController.sendReports);
router.post('/:parentId/reports/:reportType/send', parentController.sendReportToParent);
router.post('/', parentController.createParent);
router.put('/:parentId', parentController.updateParent);
router.delete('/:parentId', parentController.deleteParent);

module.exports = router;
