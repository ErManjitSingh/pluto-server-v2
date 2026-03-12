import mongoose from 'mongoose';
import PackageTracker from '../models/packagetracker.model.js';

// Track a new download
export const trackDownload = async (req, res) => {
  try {
    const { packageId, packageName, downloadType, timestamp, user } = req.body;

    if (!user) {
      return res.status(400).json({ message: 'User data is required' });
    }

    // Validate downloadType
    if (!['pluto', 'demand-setu'].includes(downloadType)) {
      return res.status(400).json({ message: 'Invalid download type. Must be pluto or demand-setu' });
    }

    const downloadDate = new Date(timestamp).toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Find existing package or create new one
    let packageTracker = await PackageTracker.findOne({ packageId });

    if (packageTracker) {
      // Find if this user already exists
      let userEntry = packageTracker.users.find(u => u.user.id === user.id);
      
      if (userEntry) {
        // Add download to existing user
        userEntry.downloads.push({
          downloadType,
          timestamp: new Date(timestamp),
          downloadDate
        });
      } else {
        // Add new user with their first download
        packageTracker.users.push({
          user,
          downloads: [{
            downloadType,
            timestamp: new Date(timestamp),
            downloadDate
          }]
        });
      }
      
      // Update download counts
      packageTracker.downloadCounts[downloadType] += 1;
      packageTracker.downloadCounts.total += 1;
      
      await packageTracker.save();
    } else {
      // Create new package tracker with first user and download
      packageTracker = new PackageTracker({
        packageId,
        packageName,
        users: [{
          user,
          downloads: [{
            downloadType,
            timestamp: new Date(timestamp),
            downloadDate
          }]
        }],
        downloadCounts: {
          pluto: downloadType === 'pluto' ? 1 : 0,
          'demand-setu': downloadType === 'demand-setu' ? 1 : 0,
          total: 1
        }
      });
      
      await packageTracker.save();
    }

    // Return the updated package with user-specific downloads
    const userDownloads = packageTracker.users.find(u => u.user.id === user.id);
    
    res.status(200).json({
      packageId: packageTracker.packageId,
      packageName: packageTracker.packageName,
      downloadCounts: packageTracker.downloadCounts,
      userDownloads: userDownloads || null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get download counts for a specific package
export const getDownloadCounts = async (req, res) => {
  try {
    const { packageId } = req.params;
    
    const packageTracker = await PackageTracker.findOne({ packageId });
    
    if (!packageTracker) {
      return res.status(200).json({
        pluto: 0,
        'demand-setu': 0,
        total: 0
      });
    }

    res.status(200).json(packageTracker.downloadCounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all packages with their download counts
export const getAllPackages = async (req, res) => {
  try {
    const packages = await PackageTracker.find()
      .select('packageId packageName downloadCounts users createdAt updatedAt')
      .sort({ createdAt: -1 }); // Sort by newest first

    // Transform the data to include detailed information
    const formattedPackages = packages.map(pkg => {
      // Process users and their downloads
      const processedUsers = (pkg.users || []).map(userEntry => {
        // Group downloads by date for each user
        const downloadsByDate = {};
        
        (userEntry.downloads || []).forEach(download => {
          const date = download.downloadDate;
          if (!downloadsByDate[date]) {
            downloadsByDate[date] = {
              date,
              downloads: [],
              counts: {
                pluto: 0,
                'demand-setu': 0,
                total: 0
              }
            };
          }
          downloadsByDate[date].downloads.push({
            downloadType: download.downloadType,
            timestamp: download.timestamp
          });
          downloadsByDate[date].counts[download.downloadType]++;
          downloadsByDate[date].counts.total++;
        });

        return {
          user: userEntry.user,
          downloadHistory: Object.values(downloadsByDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
          totalDownloads: userEntry.downloads.length
        };
      });

      // Get all downloads from all users
      const allDownloads = pkg.users.reduce((downloads, userEntry) => {
        return downloads.concat(userEntry.downloads || []);
      }, []);

      // Get the last download if any exists
      const lastDownload = allDownloads.length > 0 
        ? allDownloads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        : null;

      return {
        packageId: pkg.packageId,
        packageName: pkg.packageName,
        downloadCounts: pkg.downloadCounts || {
          pluto: 0,
          'demand-setu': 0,
          total: 0
        },
        totalUsers: processedUsers.length,
        users: processedUsers,
        lastDownload: lastDownload ? {
          downloadType: lastDownload.downloadType,
          downloadDate: lastDownload.downloadDate,
          timestamp: lastDownload.timestamp
        } : null,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
        _id: pkg._id
      };
    });

    res.status(200).json(formattedPackages);
  } catch (error) {
    console.error('Error in getAllPackages:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get packages with at least one demand-setu download
export const getPackagesByDemandSetu = async (req, res) => {
  try {
    const packages = await PackageTracker.find({ 'downloadCounts.demand-setu': { $gt: 0 } })
      .select('packageId packageName downloadCounts users createdAt updatedAt')
      .sort({ createdAt: -1 });

    const formattedPackages = packages.map(pkg => {
      const processedUsers = (pkg.users || []).map(userEntry => {
        const downloadsByDate = {};
        (userEntry.downloads || []).forEach(download => {
          const date = download.downloadDate;
          if (!downloadsByDate[date]) {
            downloadsByDate[date] = {
              date,
              downloads: [],
              counts: { pluto: 0, 'demand-setu': 0, total: 0 }
            };
          }
          downloadsByDate[date].downloads.push({
            downloadType: download.downloadType,
            timestamp: download.timestamp
          });
          downloadsByDate[date].counts[download.downloadType]++;
          downloadsByDate[date].counts.total++;
        });
        return {
          user: userEntry.user,
          downloadHistory: Object.values(downloadsByDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
          totalDownloads: userEntry.downloads.length
        };
      });
      const allDownloads = (pkg.users || []).reduce((downloads, userEntry) => {
        return downloads.concat(userEntry.downloads || []);
      }, []);
      const lastDownload = allDownloads.length > 0
        ? allDownloads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        : null;
      return {
        packageId: pkg.packageId,
        packageName: pkg.packageName,
        downloadCounts: pkg.downloadCounts || { pluto: 0, 'demand-setu': 0, total: 0 },
        totalUsers: processedUsers.length,
        users: processedUsers,
        lastDownload: lastDownload ? {
          downloadType: lastDownload.downloadType,
          downloadDate: lastDownload.downloadDate,
          timestamp: lastDownload.timestamp
        } : null,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
        _id: pkg._id
      };
    });
    res.status(200).json(formattedPackages);
  } catch (error) {
    console.error('Error in getPackagesByDemandSetu:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get packages with at least one pluto download
export const getPackagesByPluto = async (req, res) => {
  try {
    const packages = await PackageTracker.find({ 'downloadCounts.pluto': { $gt: 0 } })
      .select('packageId packageName downloadCounts users createdAt updatedAt')
      .sort({ createdAt: -1 });

    const formattedPackages = packages.map(pkg => {
      const processedUsers = (pkg.users || []).map(userEntry => {
        const downloadsByDate = {};
        (userEntry.downloads || []).forEach(download => {
          const date = download.downloadDate;
          if (!downloadsByDate[date]) {
            downloadsByDate[date] = {
              date,
              downloads: [],
              counts: { pluto: 0, 'demand-setu': 0, total: 0 }
            };
          }
          downloadsByDate[date].downloads.push({
            downloadType: download.downloadType,
            timestamp: download.timestamp
          });
          downloadsByDate[date].counts[download.downloadType]++;
          downloadsByDate[date].counts.total++;
        });
        return {
          user: userEntry.user,
          downloadHistory: Object.values(downloadsByDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
          totalDownloads: userEntry.downloads.length
        };
      });
      const allDownloads = (pkg.users || []).reduce((downloads, userEntry) => {
        return downloads.concat(userEntry.downloads || []);
      }, []);
      const lastDownload = allDownloads.length > 0
        ? allDownloads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        : null;
      return {
        packageId: pkg.packageId,
        packageName: pkg.packageName,
        downloadCounts: pkg.downloadCounts || { pluto: 0, 'demand-setu': 0, total: 0 },
        totalUsers: processedUsers.length,
        users: processedUsers,
        lastDownload: lastDownload ? {
          downloadType: lastDownload.downloadType,
          downloadDate: lastDownload.downloadDate,
          timestamp: lastDownload.timestamp
        } : null,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
        _id: pkg._id
      };
    });
    res.status(200).json(formattedPackages);
  } catch (error) {
    console.error('Error in getPackagesByPluto:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get package tracker(s) by leaddetails _id
export const getPackageTrackerByLeadId = async (req, res) => {
  try {
    const { leadId } = req.params;

    if (!leadId) {
      return res.status(400).json({ message: 'Lead ID (leaddetails _id) is required' });
    }

    const leadQuery = mongoose.Types.ObjectId.isValid(leadId) && String(new mongoose.Types.ObjectId(leadId)) === leadId
      ? { $in: [leadId, new mongoose.Types.ObjectId(leadId)] }
      : leadId;

    const packageTrackers = await PackageTracker.find({
      'users.user.leaddetails._id': leadQuery
    })
      .select('packageId packageName downloadCounts users createdAt updatedAt')
      .sort({ createdAt: -1 });

    if (!packageTrackers || packageTrackers.length === 0) {
      return res.status(404).json({ message: 'No package tracker found for this lead' });
    }

    const formattedPackages = packageTrackers.map(packageTracker => {
      // Only include users that have this leadId in leaddetails
      const matchingUserEntries = (packageTracker.users || []).filter(
        userEntry => userEntry.user?.leaddetails?._id?.toString() === leadId
      );

      const processedUsers = matchingUserEntries.map(userEntry => {
        const downloadsByDate = {};

        (userEntry.downloads || []).forEach(download => {
          const date = download.downloadDate;
          if (!downloadsByDate[date]) {
            downloadsByDate[date] = {
              date,
              downloads: [],
              counts: {
                pluto: 0,
                'demand-setu': 0,
                total: 0
              }
            };
          }
          downloadsByDate[date].downloads.push({
            downloadType: download.downloadType,
            timestamp: download.timestamp
          });
          downloadsByDate[date].counts[download.downloadType]++;
          downloadsByDate[date].counts.total++;
        });

        return {
          user: userEntry.user,
          downloadHistory: Object.values(downloadsByDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
          totalDownloads: userEntry.downloads.length
        };
      });

      const allDownloads = (packageTracker.users || []).reduce((downloads, userEntry) => {
        return downloads.concat(userEntry.downloads || []);
      }, []);
      const lastDownload = allDownloads.length > 0
        ? allDownloads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        : null;

      return {
        packageId: packageTracker.packageId,
        packageName: packageTracker.packageName,
        downloadCounts: packageTracker.downloadCounts || {
          pluto: 0,
          'demand-setu': 0,
          total: 0
        },
        totalUsers: processedUsers.length,
        users: processedUsers,
        lastDownload: lastDownload
          ? {
              downloadType: lastDownload.downloadType,
              downloadDate: lastDownload.downloadDate,
              timestamp: lastDownload.timestamp
            }
          : null,
        createdAt: packageTracker.createdAt,
        updatedAt: packageTracker.updatedAt,
        _id: packageTracker._id
      };
    });

    res.status(200).json(
      formattedPackages.length === 1 ? formattedPackages[0] : formattedPackages
    );
  } catch (error) {
    console.error('Error in getPackageTrackerByLeadId:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get detailed package information including download history
export const getPackageDetails = async (req, res) => {
  try {
    const { packageId } = req.params;
    
    const packageTracker = await PackageTracker.findOne({ packageId });
    
    if (!packageTracker) {
      return res.status(404).json({ message: 'Package not found' });
    }

    // Process users and their downloads
    const processedUsers = (packageTracker.users || []).map(userEntry => {
      // Group downloads by date for each user
      const downloadsByDate = {};
      
      (userEntry.downloads || []).forEach(download => {
        const date = download.downloadDate;
        if (!downloadsByDate[date]) {
          downloadsByDate[date] = {
            date,
            downloads: [],
            counts: {
              pluto: 0,
              'demand-setu': 0,
              total: 0
            }
          };
        }
        downloadsByDate[date].downloads.push({
          downloadType: download.downloadType,
          timestamp: download.timestamp
        });
        downloadsByDate[date].counts[download.downloadType]++;
        downloadsByDate[date].counts.total++;
      });

      return {
        user: userEntry.user,
        downloadHistory: Object.values(downloadsByDate)
          .sort((a, b) => new Date(b.date) - new Date(a.date)),
        totalDownloads: userEntry.downloads.length
      };
    });

    const response = {
      packageId: packageTracker.packageId,
      packageName: packageTracker.packageName,
      downloadCounts: packageTracker.downloadCounts,
      totalUsers: processedUsers.length,
      users: processedUsers,
      createdAt: packageTracker.createdAt,
      updatedAt: packageTracker.updatedAt,
      _id: packageTracker._id
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in getPackageDetails:', error);
    res.status(500).json({ message: error.message });
  }
};

// Delete a package tracker
export const deletePackage = async (req, res) => {
  try {
    const { packageId } = req.params;
    
    const deletedPackage = await PackageTracker.findOneAndDelete({ packageId });
    
    if (!deletedPackage) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.status(200).json({ message: 'Package tracker deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete all package trackers
export const deleteAllPackages = async (req, res) => {
  try {
    // Get the count of documents before deletion
    const count = await PackageTracker.countDocuments();
    
    // Delete all documents
    await PackageTracker.deleteMany({});
    
    res.status(200).json({ 
      message: 'All package trackers deleted successfully',
      deletedCount: count
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const formatDate = (date) => date.toISOString().split('T')[0];

const addMonthsClamped = (date, months) => {
  const base = new Date(date);
  const day = base.getDate();
  const target = new Date(base);
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
};

const parseDateInput = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Get packages and downloads within a date range (default: today -> next month)
export const getPackagesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? parseDateInput(startDate) : new Date();
    if (!start) {
      return res.status(400).json({ message: 'Invalid startDate' });
    }

    const end = endDate ? parseDateInput(endDate) : addMonthsClamped(start, 1);
    if (!end) {
      return res.status(400).json({ message: 'Invalid endDate' });
    }
    if (end < start) {
      return res.status(400).json({ message: 'endDate must be on or after startDate' });
    }

    const startStr = formatDate(start);
    const endStr = formatDate(end);

    const packages = await PackageTracker.find()
      .select('packageId packageName users createdAt updatedAt')
      .sort({ createdAt: -1 });

    const formattedPackages = packages.map(pkg => {
      const processedUsers = (pkg.users || []).map(userEntry => {
        const downloadsInRange = (userEntry.downloads || []).filter(download => {
          const date = download.downloadDate;
          return date >= startStr && date <= endStr;
        });

        if (downloadsInRange.length === 0) {
          return {
            user: userEntry.user,
            downloadHistory: [],
            totalDownloads: 0
          };
        }

        const downloadsByDate = {};
        downloadsInRange.forEach(download => {
          const date = download.downloadDate;
          if (!downloadsByDate[date]) {
            downloadsByDate[date] = {
              date,
              downloads: [],
              counts: {
                pluto: 0,
                'demand-setu': 0,
                total: 0
              }
            };
          }
          downloadsByDate[date].downloads.push({
            downloadType: download.downloadType,
            timestamp: download.timestamp
          });
          downloadsByDate[date].counts[download.downloadType]++;
          downloadsByDate[date].counts.total++;
        });

        return {
          user: userEntry.user,
          downloadHistory: Object.values(downloadsByDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
          totalDownloads: downloadsInRange.length
        };
      });

      const filteredUsers = processedUsers.filter(userEntry => userEntry.totalDownloads > 0);

      const allDownloads = filteredUsers.reduce((downloads, userEntry) => {
        const userDownloads = userEntry.downloadHistory.flatMap(day => day.downloads || []);
        return downloads.concat(userDownloads);
      }, []);

      const downloadCounts = allDownloads.reduce((counts, download) => {
        counts[download.downloadType]++;
        counts.total++;
        return counts;
      }, { pluto: 0, 'demand-setu': 0, total: 0 });

      return {
        packageId: pkg.packageId,
        packageName: pkg.packageName,
        downloadCounts,
        totalUsers: filteredUsers.length,
        users: filteredUsers,
        dateRange: {
          startDate: startStr,
          endDate: endStr
        },
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
        _id: pkg._id
      };
    });

    res.status(200).json(formattedPackages);
  } catch (error) {
    console.error('Error in getPackagesByDateRange:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get packages filtered by team leader (id or name)
export const getPackagesByTeamLeader = async (req, res) => {
  try {
    const { teamLeaderId, teamLeaderName } = req.query;

    if (!teamLeaderId && !teamLeaderName) {
      return res.status(400).json({ message: 'teamLeaderId or teamLeaderName is required' });
    }

    const packages = await PackageTracker.find()
      .select('packageId packageName users createdAt updatedAt')
      .sort({ createdAt: -1 });

    const formattedPackages = packages.map(pkg => {
      const matchedUsers = (pkg.users || []).filter(userEntry => {
        const user = userEntry.user || {};
        if (teamLeaderId && user.teamLeaderId === teamLeaderId) {
          return true;
        }
        if (teamLeaderName && user.teamLeaderName === teamLeaderName) {
          return true;
        }
        return false;
      });

      const processedUsers = matchedUsers.map(userEntry => {
        const downloadsByDate = {};

        (userEntry.downloads || []).forEach(download => {
          const date = download.downloadDate;
          if (!downloadsByDate[date]) {
            downloadsByDate[date] = {
              date,
              downloads: [],
              counts: {
                pluto: 0,
                'demand-setu': 0,
                total: 0
              }
            };
          }
          downloadsByDate[date].downloads.push({
            downloadType: download.downloadType,
            timestamp: download.timestamp
          });
          downloadsByDate[date].counts[download.downloadType]++;
          downloadsByDate[date].counts.total++;
        });

        return {
          user: userEntry.user,
          downloadHistory: Object.values(downloadsByDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
          totalDownloads: userEntry.downloads.length
        };
      });

      const allDownloads = processedUsers.reduce((downloads, userEntry) => {
        const userDownloads = userEntry.downloadHistory.flatMap(day => day.downloads || []);
        return downloads.concat(userDownloads);
      }, []);

      const downloadCounts = allDownloads.reduce((counts, download) => {
        counts[download.downloadType]++;
        counts.total++;
        return counts;
      }, { pluto: 0, 'demand-setu': 0, total: 0 });

      return {
        packageId: pkg.packageId,
        packageName: pkg.packageName,
        downloadCounts,
        totalUsers: processedUsers.length,
        users: processedUsers,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
        _id: pkg._id
      };
    }).filter(pkg => pkg.totalUsers > 0);

    res.status(200).json(formattedPackages);
  } catch (error) {
    console.error('Error in getPackagesByTeamLeader:', error);
    res.status(500).json({ message: error.message });
  }
};
