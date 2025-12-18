import express from 'express';
import { 
  createAddd, 
  getAddds, 
  getAddd, 
  updateAddd, 
  deleteAddd,
  deleteMultipleAddds,
   getAdddsByState,
   getPackagesByTeamLeaderId,
   getPackagesOnly
} from '../controllers/packageApproval.controller.js';

const router = express.Router();

router.post('/createapproval', createAddd);
router.get('/getapproval', getAddds);
router.get('/getpackagesonly', getPackagesOnly);
router.get('/getapproval/:id', getAddd);
router.put('/updateapproval/:id', updateAddd);
router.delete('/deleteapproval/:id', deleteAddd);
router.get('/getapprovalbystate/:state', getAdddsByState);
router.get('/getpackagesbyteamleader/:teamLeaderId', getPackagesByTeamLeaderId);
router.delete('/delete-multipleapproval', deleteMultipleAddds);

export default router;
