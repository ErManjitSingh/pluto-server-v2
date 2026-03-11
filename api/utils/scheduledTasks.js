import cron from 'node-cron';
import Operation from '../models/finalcosting.model.js';
import { renewGmailWatch } from '../controllers/gmail.controller.js';
import GmailToken from '../models/gmailToken.model.js';
import { syncMetaLeads } from '../services/metaLeadSync.service.js';

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
 * Renew Gmail watches for all active makers
 * Gmail watch expires every 7 days, so we renew every 6 days
 */
export const renewAllGmailWatches = async () => {
  try {
    // Find all active Gmail tokens that need renewal
    // Renew if watchExpiration is null or expires within 1 day
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

    const tokensToRenew = await GmailToken.find({
      isActive: true,
      $or: [
        { watchExpiration: null },
        { watchExpiration: { $lte: oneDayFromNow } }
      ]
    });

    console.log(`🔄 Renewing Gmail watches for ${tokensToRenew.length} makers...`);

    const results = await Promise.allSettled(
      tokensToRenew.map(token => renewGmailWatch(token.userId))
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    console.log(`✅ Gmail watch renewal complete: ${successful} successful, ${failed} failed`);
    
    return {
      success: true,
      total: tokensToRenew.length,
      successful,
      failed
    };
  } catch (error) {
    console.error('❌ Error in Gmail watch renewal:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Initialize scheduled tasks
 * Runs cleanup daily at 2:00 AM
 * Renews Gmail watches daily at 3:00 AM
 */
export const initializeScheduledTasks = () => {
  // Schedule daily cleanup at 2:00 AM
  // Cron format: minute hour day month dayOfWeek
  // '0 2 * * *' = At 02:00 AM every day
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running scheduled cleanup of old non-converted operations...');
    await deleteOldNonConvertedOperations();
  });

  // Schedule Gmail watch renewal daily at 3:00 AM
  // This checks and renews watches that expire within 1 day
  cron.schedule('0 3 * * *', async () => {
    console.log('🕐 Running Gmail watch renewal...');
    await renewAllGmailWatches();
  });

  // Meta (FB/Instagram) lead sync: every 3 minutes – fetch leads, skip if lead_meta_id exists, else create
  cron.schedule('*/3 * * * *', async () => {
    try {
      await syncMetaLeads();
    } catch (err) {
      console.error('❌ Meta lead sync scheduled run error:', err);
    }
  });

  console.log('✅ Scheduled tasks initialized:');
  console.log('   - Daily cleanup at 2:00 AM');
  console.log('   - Gmail watch renewal at 3:00 AM');
  console.log('   - Meta lead sync every 3 minutes');
};

