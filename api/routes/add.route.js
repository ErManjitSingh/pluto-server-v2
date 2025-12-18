import express from 'express';
import { 
  createAdd, 
  getAdds, 
  getAdd, 
  updateAdd, 
  deleteAdd,
  deleteMultipleAdds,
  getPackageOnly 
} from '../controllers/add.controller.js';

const router = express.Router();

router.post('/create', createAdd);
router.get('/get', getAdds);
router.get('/get/:id', getAdd);
router.get('/packages', getPackageOnly);
router.put('/update/:id', updateAdd);
router.delete('/delete/:id', deleteAdd);
router.delete('/delete-multiple', deleteMultipleAdds);

export default router;
