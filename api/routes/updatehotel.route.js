import express from 'express';
import {
  createHotelUpdate,
  getAllHotelUpdates,
  getHotelUpdate,
  updateHotelUpdate,
  deleteHotelUpdate
} from '../controllers/updatehotel.controller.js';

const router = express.Router();

router.post('/create', createHotelUpdate);
router.get('/get', getAllHotelUpdates);
router.get('/gethotelupdate/:id', getHotelUpdate);
router.put('/update/:id', updateHotelUpdate);
router.delete('/delete/:id', deleteHotelUpdate);

export default router;
