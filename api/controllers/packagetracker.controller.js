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
