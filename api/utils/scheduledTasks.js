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
 * Schedule Meta lead sync to run once, then again 3 months after each run.
 */
const scheduleMetaLeadSyncEveryThreeMonths = () => {
  const scheduleNext = () => {
    const nextRunAt = new Date();
    nextRunAt.setMonth(nextRunAt.getMonth() + 3);

    setTimeout(async () => {
      try {
        await syncMetaLeads();
      } catch (err) {
        console.error('❌ Meta lead sync scheduled run error:', err);
      }
      scheduleNext();
    }, nextRunAt.getTime() - Date.now());
  };

  scheduleNext();
};

/**
 * Initialize scheduled tasks
 */
export const initializeScheduledTasks = () => {
  let webmailPolling = false;

  // Meta (FB/Instagram) lead sync — runs every 3 months after the previous run
  scheduleMetaLeadSyncEveryThreeMonths();

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
