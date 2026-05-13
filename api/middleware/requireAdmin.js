import Maker from '../models/maker.model.js';
import { errorHandler } from '../utils/error.js';

/**
 * Admin/Manager/TL gate.
 *
 * Run AFTER verifyToken so req.user.id is set.
 *
 * A maker counts as admin if their `userType` is one of:
 *   admin | Admin | manager | Manager | TL | TeamLeader | teamleader
 *
 * To grant a user admin access, update their `userType` in DB:
 *   db.makers.updateOne({ _id: <id> }, { $set: { userType: "admin" } })
 */
const ADMIN_TYPES = new Set([
  'admin',
  'Admin',
  'manager',
  'Manager',
  'TL',
  'Executive',
  'TeamLeader',
  'teamleader',
]);

export const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next(errorHandler(401, 'Authentication required'));

    const maker = await Maker.findById(userId).select('userType firstName lastName companyName');
    if (!maker) return next(errorHandler(404, 'User not found'));

    if (!ADMIN_TYPES.has(maker.userType)) {
      return next(errorHandler(403, 'Admin / Manager / Team Leader access required'));
    }

    req.adminUser = maker;
    next();
  } catch (err) {
    next(err);
  }
};
