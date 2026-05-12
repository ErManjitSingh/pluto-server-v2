import cron from 'node-cron';
import Operation from '../models/finalcosting.model.js';
import { syncMetaLeads } from '../services/metaLeadSync.service.js';
import { syncAllAccounts } from '../services/imapService.js';

/**
 * Deletes old non-converted operations (older than 10 days)
 * Preserves all converted operations regardless of age
 */
export const deleteOldNonConvertedOperations = async () => {
  try {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const deleteResult = await Operation.deleteMany({
      $or: [
        { converted: { $ne: true } },
        { converted: { $exists: false } }
      ],
      createdAt: { $lt: tenDaysAgo }
    });

    console.log(`✅ Scheduled cleanup: Deleted ${deleteResult.deletedCount} old non-converted operations (cutoff: ${tenDaysAgo.toISOString()})`);
    return {
      success: true,
      deletedCount: deleteResult.deletedCount,
      cutoffDate: tenDaysAgo.toISOString()
    };
  } catch (error) {
    console.error('❌ Error in scheduled cleanup of old operations:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Initialize scheduled tasks
 */
export const initializeScheduledTasks = () => {
  let webmailPolling = false;

  // Daily cleanup at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running scheduled cleanup of old non-converted operations...');
    await deleteOldNonConvertedOperations();
  });

  // Meta (FB/Instagram) lead sync every 3 minutes
  cron.schedule('*/3 * * * *', async () => {
    try {
      await syncMetaLeads();
    } catch (err) {
      console.error('❌ Meta lead sync scheduled run error:', err);
    }
  });

  // Webmail IMAP poll — every 60 seconds (with overlap guard)
  cron.schedule('*/1 * * * *', async () => {
    if (webmailPolling) {
      console.log('⏭️  Webmail poll skipped (previous cycle still running)');
      return;
    }
    webmailPolling = true;
    const t0 = Date.now();
    try {
      const result = await syncAllAccounts({ concurrency: 5 });
      if (result.synced > 0 || result.total > 0) {
        console.log(`📬 Webmail poll: ${result.synced} new emails across ${result.total} accounts (${Date.now() - t0}ms)`);
      }
    } catch (err) {
      console.error('❌ Webmail poll error:', err.message);
    } finally {
      webmailPolling = false;
    }
  });


};
