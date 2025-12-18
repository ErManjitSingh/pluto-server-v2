import cron from 'node-cron';
import Operation from '../models/finalcosting.model.js';

/**
 * Deletes old non-converted operations (older than 10 days)
 * Preserves all converted operations regardless of age
 */
export const deleteOldNonConvertedOperations = async () => {
  try {
    // Calculate the date 10 days ago
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10); // 10 days

    // Find and delete operations that:
    // 1. Are NOT converted (converted !== true, which includes false, null, or undefined)
    // 2. Were created more than 10 days ago
    const deleteResult = await Operation.deleteMany({
      $or: [
        { converted: { $ne: true } }, // Not equal to true (includes false, null, undefined)
        { converted: { $exists: false } } // Field doesn't exist
      ],
      createdAt: { $lt: tenDaysAgo } // Created before 10 days ago
    });

    console.log(`✅ Scheduled cleanup: Deleted ${deleteResult.deletedCount} old non-converted operations (cutoff: ${tenDaysAgo.toISOString()})`);
    return {
      success: true,
      deletedCount: deleteResult.deletedCount,
      cutoffDate: tenDaysAgo.toISOString()
    };
  } catch (error) {
    console.error('❌ Error in scheduled cleanup of old operations:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Initialize scheduled tasks
 * Runs cleanup daily at 2:00 AM
 */
export const initializeScheduledTasks = () => {
  // Schedule daily cleanup at 2:00 AM
  // Cron format: minute hour day month dayOfWeek
  // '0 2 * * *' = At 02:00 AM every day
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running scheduled cleanup of old non-converted operations...');
    await deleteOldNonConvertedOperations();
  });

  console.log('✅ Scheduled tasks initialized: Daily cleanup at 2:00 AM');
};

