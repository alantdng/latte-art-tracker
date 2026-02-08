console.log('storage.js loading...');
/**
 * Storage module for Latte'd app
 * Handles IndexedDB for media blobs and localStorage for metadata
 * Designed to be easily swapped for API calls later
 */

const DB_NAME = 'lattedDB';
const DB_VERSION = 1;
const MEDIA_STORE = 'latteMedia';
const ENTRIES_KEY = 'latte_entries';
const SETTINGS_KEY = 'latte_settings';
const PROFILE_KEY = 'latte_profile';
const FOLLOWING_KEY = 'latte_following';
const NOTIFICATIONS_KEY = 'latte_notifications';
const VOTES_KEY = 'latte_votes';
const LOADOUTS_KEY = 'latte_loadouts';
const ACTIVE_LOADOUT_KEY = 'latte_active_loadout';
const SAVED_COMMENTS_KEY = 'latte_saved_comments';
const REPORTED_COMMENTS_KEY = 'latte_reported_comments';
const SMART_DEFAULTS_KEY = 'latte_smart_defaults';
const ENTRY_DRAFT_KEY = 'latte_entry_draft';

let idb = null;

// Dropdown options
const SPOUT_TIPS = ['Narrow', 'Sharp', 'Round', 'Wide'];

/**
 * Initialize IndexedDB
 */
async function initDB() {
  // Check for file:// protocol
  if (window.location.protocol === 'file:') {
    console.error('ERROR: App opened via file:// protocol. Please use a local server.');
    alert('This app requires a local web server to function properly.\n\nPlease access via http://localhost:8080 instead of opening the file directly.');
    return null;
  }

  if (idb) return idb;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      idb = request.result;
      resolve(idb);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        database.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Generate a UUID
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Save media blob to IndexedDB
 */
async function saveMedia(id, blob) {
  await initDB();
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction([MEDIA_STORE], 'readwrite');
    const store = transaction.objectStore(MEDIA_STORE);
    const request = store.put({ id, blob });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get media blob from IndexedDB
 */
async function getMedia(id) {
  await initDB();
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction([MEDIA_STORE], 'readonly');
    const store = transaction.objectStore(MEDIA_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result ? request.result.blob : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete media from IndexedDB
 */
async function deleteMedia(id) {
  await initDB();
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction([MEDIA_STORE], 'readwrite');
    const store = transaction.objectStore(MEDIA_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==========================================
// Cloud Sync Functions (Firebase)
// ==========================================

let syncInProgress = false;
let lastSyncTime = 0;

/**
 * Get current user ID from Firebase Auth
 */
function getCurrentUserId() {
  const user = window.firebaseAuth?.currentUser;
  return user ? user.uid : null;
}

/**
 * Upload media to Firebase Storage
 */
async function uploadMediaToCloud(entryId, blob) {
  const userId = getCurrentUserId();
  if (!userId || !blob) return null;

  try {
    const storage = window.firebaseStorage;
    const ref = storage.ref(`users/${userId}/entries/${entryId}/media`);

    const snapshot = await ref.put(blob);
    const downloadUrl = await snapshot.ref.getDownloadURL();

    console.log('Media uploaded to cloud:', entryId);
    return downloadUrl;
  } catch (error) {
    console.error('Error uploading media to cloud:', error);
    return null;
  }
}

/**
 * Download media from Firebase Storage
 */
async function downloadMediaFromCloud(entryId) {
  const userId = getCurrentUserId();
  if (!userId) return null;

  try {
    const storage = window.firebaseStorage;
    const ref = storage.ref(`users/${userId}/entries/${entryId}/media`);

    const url = await ref.getDownloadURL();
    const response = await fetch(url);
    const blob = await response.blob();

    console.log('Media downloaded from cloud:', entryId);
    return blob;
  } catch (error) {
    // Media might not exist in cloud yet
    if (error.code !== 'storage/object-not-found') {
      console.error('Error downloading media from cloud:', error);
    }
    return null;
  }
}

/**
 * Delete media from Firebase Storage
 */
async function deleteMediaFromCloud(entryId) {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    const storage = window.firebaseStorage;
    const ref = storage.ref(`users/${userId}/entries/${entryId}/media`);
    await ref.delete();
    console.log('Media deleted from cloud:', entryId);
  } catch (error) {
    if (error.code !== 'storage/object-not-found') {
      console.error('Error deleting media from cloud:', error);
    }
  }
}

/**
 * Sync a single entry to Firestore
 */
async function syncEntryToCloud(entry, mediaBlob = null) {
  const userId = getCurrentUserId();
  if (!userId) return false;

  try {
    const db = window.firebaseDb;
    const entryRef = db.collection('users').doc(userId).collection('entries').doc(entry.id);

    // Upload media if provided
    let mediaUrl = entry.media?.cloudUrl || null;
    if (mediaBlob) {
      mediaUrl = await uploadMediaToCloud(entry.id, mediaBlob);
    }

    // Prepare entry data for Firestore (without large thumbnail)
    const cloudEntry = {
      ...entry,
      media: {
        type: entry.media.type,
        cloudUrl: mediaUrl,
        // Don't store base64 thumbnail in Firestore - too large
        thumbnail: null
      },
      syncedAt: Date.now(),
      userId: userId
    };

    await entryRef.set(cloudEntry);
    console.log('Entry synced to cloud:', entry.id);

    // Update local entry with cloud URL
    if (mediaUrl) {
      const entries = getEntries();
      const index = entries.findIndex(e => e.id === entry.id);
      if (index !== -1) {
        entries[index].media.cloudUrl = mediaUrl;
        saveEntries(entries);
      }
    }

    // Sync to public feed if entry is public
    if (entry.isPublic) {
      await addToPublicFeed(entry, mediaUrl);
    } else {
      // Remove from public feed if it was previously public
      await removeFromPublicFeed(entry.id);
    }

    return true;
  } catch (error) {
    console.error('Error syncing entry to cloud:', error);
    return false;
  }
}

/**
 * Delete entry from Firestore
 */
async function deleteEntryFromCloud(entryId) {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    const db = window.firebaseDb;
    await db.collection('users').doc(userId).collection('entries').doc(entryId).delete();
    await deleteMediaFromCloud(entryId);
    // Also remove from public feed
    await removeFromPublicFeed(entryId);
    console.log('Entry deleted from cloud:', entryId);
  } catch (error) {
    console.error('Error deleting entry from cloud:', error);
  }
}

// ==========================================
// Public Feed Functions (Shared Community Feed)
// ==========================================

/**
 * Add or update entry in the public feed
 */
async function addToPublicFeed(entry, mediaUrl) {
  const userId = getCurrentUserId();
  if (!userId) return false;

  try {
    const db = window.firebaseDb;
    const profile = getProfile();

    // Get Firebase user for display name
    const firebaseUser = window.firebaseAuth?.currentUser;
    const displayName = firebaseUser?.displayName || profile.name || 'Anonymous';

    const publicEntry = {
      id: entry.id,
      odId: userId,
      createdAt: entry.createdAt,
      updatedAt: Date.now(),
      media: {
        type: entry.media.type,
        cloudUrl: mediaUrl
      },
      params: entry.params || {},
      beans: entry.beans || null,
      rating: entry.rating || 0,
      notes: entry.notes || '',
      user: {
        odId: userId,
        name: displayName,
        id: profile.id,
        location: profile.location || null,
        picture: profile.picture || null
      }
    };

    await db.collection('publicFeed').doc(entry.id).set(publicEntry);
    console.log('Entry added to public feed:', entry.id);
    return true;
  } catch (error) {
    console.error('Error adding to public feed:', error);
    return false;
  }
}

/**
 * Remove entry from the public feed
 */
async function removeFromPublicFeed(entryId) {
  try {
    const db = window.firebaseDb;
    await db.collection('publicFeed').doc(entryId).delete();
    console.log('Entry removed from public feed:', entryId);
  } catch (error) {
    // Ignore if entry doesn't exist in public feed
    if (error.code !== 'not-found') {
      console.error('Error removing from public feed:', error);
    }
  }
}

/**
 * Fetch entries from the public feed
 */
async function fetchPublicFeed(options = {}) {
  try {
    const db = window.firebaseDb;
    let query = db.collection('publicFeed')
      .orderBy('createdAt', 'desc')
      .limit(options.limit || 50);

    // Apply filters
    if (options.country) {
      query = query.where('user.location.country', '==', options.country);
    }
    if (options.pattern) {
      query = query.where('params.artPattern', '==', options.pattern);
    }

    const snapshot = await query.get();
    const entries = [];

    snapshot.forEach(doc => {
      entries.push(doc.data());
    });

    console.log(`Fetched ${entries.length} entries from public feed`);
    return entries;
  } catch (error) {
    console.error('Error fetching public feed:', error);
    return [];
  }
}

// Cache for public feed data
let publicFeedCache = [];
let publicFeedLastFetch = 0;
const PUBLIC_FEED_CACHE_TTL = 30000; // 30 seconds

/**
 * Get public feed with caching
 */
async function getPublicFeedCached(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && publicFeedCache.length > 0 && (now - publicFeedLastFetch) < PUBLIC_FEED_CACHE_TTL) {
    return publicFeedCache;
  }

  publicFeedCache = await fetchPublicFeed();
  publicFeedLastFetch = now;
  return publicFeedCache;
}

/**
 * Refresh the public feed cache
 */
function refreshPublicFeedCache() {
  publicFeedLastFetch = 0;
}

/**
 * Sync all local entries to cloud (for initial upload)
 */
async function syncAllToCloud(progressCallback = null) {
  const userId = getCurrentUserId();
  if (!userId) {
    console.log('No user logged in, skipping cloud sync');
    return;
  }

  const entries = getEntries();
  const total = entries.length;
  let synced = 0;

  console.log(`Starting cloud sync for ${total} entries...`);

  for (const entry of entries) {
    // Get media blob from local IndexedDB
    const mediaBlob = await getMedia(entry.id);

    // Only upload if we have local media and no cloud URL yet
    const needsMediaUpload = mediaBlob && !entry.media?.cloudUrl;

    await syncEntryToCloud(entry, needsMediaUpload ? mediaBlob : null);

    synced++;
    if (progressCallback) {
      progressCallback(synced, total);
    }
  }

  console.log(`Cloud sync complete: ${synced}/${total} entries`);
  lastSyncTime = Date.now();
}

/**
 * Download all entries from cloud and merge with local
 */
async function syncFromCloud(progressCallback = null) {
  const userId = getCurrentUserId();
  if (!userId) {
    console.log('No user logged in, skipping cloud download');
    return;
  }

  if (syncInProgress) {
    console.log('Sync already in progress, skipping');
    return;
  }

  syncInProgress = true;

  try {
    const db = window.firebaseDb;
    const snapshot = await db.collection('users').doc(userId).collection('entries')
      .orderBy('createdAt', 'desc')
      .get();

    const cloudEntries = [];
    snapshot.forEach(doc => {
      cloudEntries.push(doc.data());
    });

    console.log(`Found ${cloudEntries.length} entries in cloud`);

    const localEntries = getEntries();
    const localEntryIds = new Set(localEntries.map(e => e.id));

    let downloaded = 0;
    const total = cloudEntries.length;

    // Process cloud entries
    for (const cloudEntry of cloudEntries) {
      // Check if we have this entry locally
      if (!localEntryIds.has(cloudEntry.id)) {
        // Download media from cloud
        let mediaBlob = null;
        if (cloudEntry.media?.cloudUrl) {
          mediaBlob = await downloadMediaFromCloud(cloudEntry.id);
          if (mediaBlob) {
            // Save media to local IndexedDB
            await saveMedia(cloudEntry.id, mediaBlob);
            // Create thumbnail locally
            cloudEntry.media.thumbnail = await createThumbnail(mediaBlob, cloudEntry.media.type);
          }
        }

        // Add to local entries
        localEntries.push(cloudEntry);
        console.log('Downloaded entry from cloud:', cloudEntry.id);
      } else {
        // Entry exists locally - check if cloud version is newer
        const localEntry = localEntries.find(e => e.id === cloudEntry.id);
        if (localEntry && cloudEntry.syncedAt > (localEntry.syncedAt || 0)) {
          // Cloud is newer, update local (but keep local media)
          const index = localEntries.findIndex(e => e.id === cloudEntry.id);
          localEntries[index] = {
            ...cloudEntry,
            media: {
              ...cloudEntry.media,
              thumbnail: localEntry.media?.thumbnail // Keep local thumbnail
            }
          };
          console.log('Updated entry from cloud:', cloudEntry.id);
        }
      }

      downloaded++;
      if (progressCallback) {
        progressCallback(downloaded, total);
      }
    }

    // Sort by date and save
    localEntries.sort((a, b) => b.createdAt - a.createdAt);
    saveEntries(localEntries);

    console.log('Cloud sync download complete');
    lastSyncTime = Date.now();
  } catch (error) {
    console.error('Error syncing from cloud:', error);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Full bidirectional sync
 */
async function performFullSync(progressCallback = null) {
  const userId = getCurrentUserId();
  if (!userId) return;

  console.log('Performing full bidirectional sync...');

  // First, download from cloud
  await syncFromCloud(progressCallback);

  // Then, upload any local entries that aren't in cloud
  await syncAllToCloud(progressCallback);

  console.log('Full sync complete');
}

/**
 * Sync user profile to cloud
 */
async function syncProfileToCloud() {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    const profile = getProfile();
    const db = window.firebaseDb;

    await db.collection('users').doc(userId).set({
      profile: profile,
      updatedAt: Date.now()
    }, { merge: true });

    console.log('Profile synced to cloud');
  } catch (error) {
    console.error('Error syncing profile to cloud:', error);
  }
}

/**
 * Download user profile from cloud
 */
async function syncProfileFromCloud() {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    const db = window.firebaseDb;
    const doc = await db.collection('users').doc(userId).get();

    if (doc.exists && doc.data().profile) {
      const cloudProfile = doc.data().profile;
      const localProfile = getProfile();

      // Merge cloud profile with local, preferring cloud data
      const mergedProfile = {
        ...localProfile,
        ...cloudProfile,
        id: localProfile.id // Keep local ID consistent
      };

      saveProfile(mergedProfile);
      console.log('Profile downloaded from cloud');
    }
  } catch (error) {
    console.error('Error downloading profile from cloud:', error);
  }
}

/**
 * Get all entries metadata from localStorage
 */
function getEntries() {
  const data = localStorage.getItem(ENTRIES_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save entries metadata to localStorage
 */
function saveEntries(entries) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

/**
 * Get a single entry by ID
 */
function getEntry(id) {
  const entries = getEntries();
  return entries.find(e => e.id === id) || null;
}

/**
 * Create a new entry
 */
async function createEntry(entryData, mediaBlob) {
  const id = generateId();
  const thumbnail = await createThumbnail(mediaBlob, entryData.media.type);
  const profile = getProfile();

  const entry = {
    id,
    createdAt: Date.now(),
    media: {
      type: entryData.media.type,
      thumbnail
    },
    params: entryData.params,
    beans: entryData.beans || null,
    rating: entryData.rating || 0,
    notes: entryData.notes || '',
    comments: [],
    user: {
      id: profile.id,
      name: profile.name || 'Anonymous',
      location: profile.location || null
    },
    isPublic: entryData.isPublic || false
  };

  // Save media locally first
  await saveMedia(id, mediaBlob);

  // Save entry locally
  const entries = getEntries();
  entries.unshift(entry);
  saveEntries(entries);

  // Save smart defaults for next time
  saveSmartDefaults(entryData);

  // Clear any saved draft
  clearEntryDraft();

  // Sync to cloud in background (don't await to avoid blocking)
  syncEntryToCloud(entry, mediaBlob).catch(err => {
    console.error('Background cloud sync failed:', err);
  });

  return entry;
}

/**
 * Update an existing entry
 */
async function updateEntry(id, entryData, mediaBlob = null) {
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === id);

  if (index === -1) {
    throw new Error('Entry not found');
  }

  const entry = entries[index];

  // Update media if new blob provided
  if (mediaBlob) {
    const thumbnail = await createThumbnail(mediaBlob, entryData.media.type);
    await saveMedia(id, mediaBlob);
    entry.media = {
      type: entryData.media.type,
      thumbnail,
      cloudUrl: null // Reset cloud URL since media changed
    };
  }

  // Update other fields
  entry.params = entryData.params;
  entry.beans = entryData.beans || null;
  entry.rating = entryData.rating || 0;
  entry.notes = entryData.notes || '';
  entry.isPublic = entryData.isPublic || false;

  entries[index] = entry;
  saveEntries(entries);

  // Sync to cloud in background
  syncEntryToCloud(entry, mediaBlob).catch(err => {
    console.error('Background cloud sync failed:', err);
  });

  return entry;
}

/**
 * Delete an entry
 */
async function deleteEntry(id) {
  // Delete media from IndexedDB
  await deleteMedia(id);

  // Remove from localStorage
  const entries = getEntries();
  const filtered = entries.filter(e => e.id !== id);
  saveEntries(filtered);

  // Delete from cloud in background
  deleteEntryFromCloud(id).catch(err => {
    console.error('Background cloud delete failed:', err);
  });
}

/**
 * Add a comment to an entry
 * @param {string} entryId - Entry ID
 * @param {string} commentText - Comment text
 * @param {string} parentId - Optional parent comment ID for replies
 */
function addComment(entryId, commentText, parentId = null) {
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === entryId);

  if (index === -1) return null;

  const profile = getProfile();
  const comment = {
    id: generateId(),
    userId: profile.id,
    userName: profile.name || 'Anonymous',
    text: commentText,
    createdAt: Date.now(),
    updatedAt: null,
    upvotes: 0,
    downvotes: 0,
    parentId: parentId
  };

  if (!entries[index].comments) {
    entries[index].comments = [];
  }
  entries[index].comments.push(comment);
  saveEntries(entries);

  // Create notification for entry owner if it's not their own comment
  const entry = entries[index];
  if (entry.user && entry.user.id !== profile.id) {
    createNotification(
      'comment',
      `${profile.name || 'Someone'} commented on your ${entry.params.artPattern} post`,
      `detail.html?id=${entryId}`
    );
  }

  // If replying to someone else's comment, notify them
  if (parentId) {
    const parentComment = entries[index].comments.find(c => c.id === parentId);
    if (parentComment && parentComment.userId !== profile.id) {
      createNotification(
        'comment',
        `${profile.name || 'Someone'} replied to your comment`,
        `post.html?id=${entryId}`
      );
    }
  }

  return comment;
}

/**
 * Edit a comment
 */
function editComment(entryId, commentId, newText) {
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === entryId);

  if (index === -1) return null;

  const profile = getProfile();
  const commentIndex = entries[index].comments?.findIndex(c => c.id === commentId);

  if (commentIndex === -1 || commentIndex === undefined) return null;

  const comment = entries[index].comments[commentIndex];

  // Only allow editing own comments
  if (comment.userId !== profile.id) return null;

  comment.text = newText;
  comment.updatedAt = Date.now();

  entries[index].comments[commentIndex] = comment;
  saveEntries(entries);

  return comment;
}

/**
 * Delete a comment
 */
function deleteComment(entryId, commentId) {
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === entryId);

  if (index === -1) return false;

  const profile = getProfile();
  const comment = entries[index].comments?.find(c => c.id === commentId);

  // Only allow deleting own comments
  if (!comment || comment.userId !== profile.id) return false;

  entries[index].comments = entries[index].comments.filter(c => c.id !== commentId);
  // Also remove any replies to this comment
  entries[index].comments = entries[index].comments.filter(c => c.parentId !== commentId);

  saveEntries(entries);
  return true;
}

/**
 * Get comments for an entry (combines local and mock)
 */
function getComments(entryId) {
  // Check local entries first
  const entry = getEntry(entryId);
  if (entry) {
    return entry.comments || [];
  }

  // Check mock entries
  const mockEntry = MOCK_ENTRIES.find(e => e.id === entryId);
  if (mockEntry) {
    return mockEntry.comments || [];
  }

  return [];
}

/**
 * Create a thumbnail from media blob
 */
async function createThumbnail(blob, type) {
  return new Promise((resolve, reject) => {
    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      console.error('Thumbnail creation timed out');
      resolve(null); // Return null instead of rejecting to allow entry creation
    }, 10000);

    try {
      if (type === 'image') {
        const img = new Image();
        img.onerror = () => {
          clearTimeout(timeout);
          console.error('Error loading image for thumbnail');
          resolve(null);
        };
        img.onload = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            const size = 200;
            const scale = Math.min(size / img.width, size / img.height);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
            URL.revokeObjectURL(img.src);
          } catch (err) {
            console.error('Error creating image thumbnail:', err);
            resolve(null);
          }
        };
        img.src = URL.createObjectURL(blob);
      } else {
        // For video, capture first frame
        const video = document.createElement('video');
        video.muted = true;
        video.onerror = () => {
          clearTimeout(timeout);
          console.error('Error loading video for thumbnail');
          resolve(null);
        };
        video.onloadeddata = () => {
          video.currentTime = 0.1;
        };
        video.onseeked = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            const size = 200;
            const scale = Math.min(size / video.videoWidth, size / video.videoHeight);
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
            URL.revokeObjectURL(video.src);
          } catch (err) {
            console.error('Error creating video thumbnail:', err);
            resolve(null);
          }
        };
        video.src = URL.createObjectURL(blob);
      }
    } catch (err) {
      clearTimeout(timeout);
      console.error('Error in createThumbnail:', err);
      resolve(null);
    }
  });
}

/**
 * Get user settings
 */
function getSettings() {
  const data = localStorage.getItem(SETTINGS_KEY);
  return data ? JSON.parse(data) : {
    tempUnit: 'F',
    volumeUnit: 'ml',
    weightUnit: 'g'
  };
}

/**
 * Save user settings
 */
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Get user profile
 */
function getProfile() {
  const data = localStorage.getItem(PROFILE_KEY);
  if (data) return JSON.parse(data);

  // Create default profile with unique ID
  const profile = {
    id: generateId(),
    name: '',
    location: {
      city: '',
      state: '',
      country: ''
    }
  };
  saveProfile(profile);
  return profile;
}

/**
 * Save user profile
 */
function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * Save profile picture (as base64)
 */
async function saveProfilePicture(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const profile = getProfile();
      profile.picture = reader.result;
      saveProfile(profile);
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get profile picture
 */
function getProfilePicture() {
  const profile = getProfile();
  return profile.picture || null;
}

/**
 * Remove profile picture
 */
function removeProfilePicture() {
  const profile = getProfile();
  delete profile.picture;
  saveProfile(profile);
}

/**
 * Get following list
 */
function getFollowing() {
  const data = localStorage.getItem(FOLLOWING_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save following list
 */
function saveFollowing(following) {
  localStorage.setItem(FOLLOWING_KEY, JSON.stringify(following));
}

/**
 * Add user to following
 */
function followUser(userId) {
  const following = getFollowing();
  if (!following.includes(userId)) {
    following.push(userId);
    saveFollowing(following);

    // Simulate receiving a notification that they followed back (for mock users)
    const mockUser = MOCK_USERS.find(u => u.id === userId);
    if (mockUser && Math.random() > 0.7) {
      setTimeout(() => {
        createNotification(
          'follow',
          `${mockUser.name} started following you back!`,
          null
        );
      }, 3000);
    }
  }
}

/**
 * Remove user from following
 */
function unfollowUser(userId) {
  const following = getFollowing();
  const filtered = following.filter(id => id !== userId);
  saveFollowing(filtered);
}

/**
 * Check if following a user
 */
function isFollowing(userId) {
  return getFollowing().includes(userId);
}

// ==========================================
// Unit Conversion Functions
// ==========================================

/**
 * Convert temperature between F and C
 */
function convertTemp(value, from, to) {
  if (from === to || !value) return value;
  if (from === 'F' && to === 'C') {
    return Math.round((value - 32) * 5 / 9);
  }
  return Math.round(value * 9 / 5 + 32);
}

/**
 * Convert volume between ml and oz
 */
function convertVolume(value, from, to) {
  if (from === to || !value) return value;
  if (from === 'ml' && to === 'oz') {
    return Math.round(value / 29.5735 * 10) / 10;
  }
  return Math.round(value * 29.5735);
}

/**
 * Convert weight between g and oz
 */
function convertWeight(value, from, to) {
  if (from === to || !value) return value;
  if (from === 'g' && to === 'oz') {
    return Math.round(value / 28.3495 * 100) / 100;
  }
  return Math.round(value * 28.3495 * 10) / 10;
}

/**
 * Format volume with unit
 */
function formatVolume(valueMl, settings) {
  if (!valueMl) return '-';
  if (settings.volumeUnit === 'oz') {
    return `${convertVolume(valueMl, 'ml', 'oz')} oz`;
  }
  return `${valueMl} ml`;
}

/**
 * Format weight with unit
 */
function formatWeight(valueG, settings) {
  if (!valueG) return '-';
  if (settings.weightUnit === 'oz') {
    return `${convertWeight(valueG, 'g', 'oz')} oz`;
  }
  return `${valueG} g`;
}

/**
 * Format temperature with unit
 */
function formatTemp(valueF, settings) {
  if (!valueF) return '-';
  if (settings.tempUnit === 'C') {
    return `${convertTemp(valueF, 'F', 'C')}°C`;
  }
  return `${valueF}°F`;
}

/**
 * Format star rating
 */
function formatRating(rating) {
  if (!rating) return '';
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(emptyStars);
}

/**
 * Render star rating HTML
 */
function renderStarRating(rating, interactive = false, size = 'normal') {
  const sizeClass = size === 'small' ? 'stars-small' : '';
  let html = `<div class="star-rating ${sizeClass}" ${interactive ? 'data-interactive="true"' : ''}>`;

  for (let i = 1; i <= 5; i++) {
    const full = rating >= i;
    const half = !full && rating >= i - 0.5;

    if (interactive) {
      html += `
        <span class="star-wrapper">
          <span class="star-half star-left ${rating >= i - 0.5 ? 'active' : ''}" data-value="${i - 0.5}">★</span>
          <span class="star-half star-right ${rating >= i ? 'active' : ''}" data-value="${i}">★</span>
        </span>
      `;
    } else {
      html += `<span class="star ${full ? 'full' : half ? 'half' : 'empty'}">${full || half ? '★' : '☆'}</span>`;
    }
  }

  html += '</div>';
  return html;
}

// ==========================================
// Mock Community Data (simulates backend)
// ==========================================

const MOCK_USERS = [
  { id: 'user1', name: 'Emma Chen', location: { city: 'Seattle', state: 'WA', country: 'USA' } },
  { id: 'user2', name: 'Marco Rossi', location: { city: 'Portland', state: 'OR', country: 'USA' } },
  { id: 'user3', name: 'Yuki Tanaka', location: { city: 'San Francisco', state: 'CA', country: 'USA' } },
  { id: 'user4', name: 'Sophie Martin', location: { city: 'Melbourne', state: 'VIC', country: 'Australia' } },
  { id: 'user5', name: 'James Wilson', location: { city: 'London', state: '', country: 'UK' } },
  { id: 'user6', name: 'Ana Silva', location: { city: 'Austin', state: 'TX', country: 'USA' } },
];

const MOCK_ENTRIES = [
  {
    id: 'mock1',
    createdAt: Date.now() - 3600000,
    media: { type: 'image', thumbnail: null },
    params: {
      milkType: 'Oat', milkPitcher: '12oz', spoutTip: 'Sharp', cupType: 'Ceramic mug',
      cupVolumeMl: 180, espressoGrams: 36, milkTempF: 140,
      artPattern: 'Rosetta', aerationTimeSec: 4, integrationTimeSec: 8
    },
    beans: { brand: 'Stumptown', name: 'Hair Bender' },
    rating: 4.5,
    notes: 'Finally nailed the rosetta!',
    comments: [
      { id: 'c1', userId: 'user2', userName: 'Marco Rossi', text: 'Beautiful definition on those leaves!', createdAt: Date.now() - 1800000 },
      { id: 'c2', userId: 'user3', userName: 'Yuki Tanaka', text: 'Love the contrast. What pitcher are you using?', createdAt: Date.now() - 900000 }
    ],
    user: MOCK_USERS[0],
    isPublic: true
  },
  {
    id: 'mock2',
    createdAt: Date.now() - 7200000,
    media: { type: 'image', thumbnail: null },
    params: {
      milkType: 'Whole', milkPitcher: '17oz', spoutTip: 'Narrow', cupType: 'Latte bowl',
      cupVolumeMl: 240, espressoGrams: 40, milkTempF: 145,
      artPattern: 'Tulip', aerationTimeSec: 3, integrationTimeSec: 10
    },
    beans: { brand: 'Blue Bottle', name: 'Giant Steps' },
    rating: 4,
    notes: 'Three layer tulip attempt',
    comments: [
      { id: 'c3', userId: 'user1', userName: 'Emma Chen', text: 'Clean stacks! Try pushing through a bit more on the last layer.', createdAt: Date.now() - 3600000 }
    ],
    user: MOCK_USERS[1],
    isPublic: true
  },
  {
    id: 'mock3',
    createdAt: Date.now() - 18000000,
    media: { type: 'image', thumbnail: null },
    params: {
      milkType: 'Oat', milkPitcher: '12oz', spoutTip: 'Round', cupType: 'Glass cup',
      cupVolumeMl: 150, espressoGrams: 32, milkTempF: 135,
      artPattern: 'Heart', aerationTimeSec: 5, integrationTimeSec: 6
    },
    beans: { brand: 'Intelligentsia', name: 'Black Cat Classic' },
    rating: 3.5,
    notes: 'Quick morning pour',
    comments: [],
    user: MOCK_USERS[2],
    isPublic: true
  },
  {
    id: 'mock4',
    createdAt: Date.now() - 43200000,
    media: { type: 'image', thumbnail: null },
    params: {
      milkType: 'Almond', milkPitcher: '20oz', spoutTip: 'Sharp', cupType: 'Ceramic mug',
      cupVolumeMl: 200, espressoGrams: 38, milkTempF: 150,
      artPattern: 'Swan', aerationTimeSec: 4, integrationTimeSec: 12
    },
    beans: { brand: 'Counter Culture', name: 'Big Trouble' },
    rating: 5,
    notes: 'Swan is getting better!',
    comments: [
      { id: 'c4', userId: 'user5', userName: 'James Wilson', text: 'Gorgeous swan! The neck definition is perfect.', createdAt: Date.now() - 36000000 },
      { id: 'c5', userId: 'user6', userName: 'Ana Silva', text: 'Goals! How long did it take you to get swans this clean?', createdAt: Date.now() - 32000000 }
    ],
    user: MOCK_USERS[3],
    isPublic: true
  },
  {
    id: 'mock5',
    createdAt: Date.now() - 86400000,
    media: { type: 'video', thumbnail: null },
    params: {
      milkType: 'Whole', milkPitcher: '12oz', spoutTip: 'Narrow', cupType: 'Cappuccino cup',
      cupVolumeMl: 150, espressoGrams: 36, milkTempF: 142,
      artPattern: 'Winged tulip', aerationTimeSec: 3, integrationTimeSec: 9
    },
    beans: { brand: 'Onyx', name: 'Monarch' },
    rating: 4,
    notes: 'First winged tulip!',
    comments: [
      { id: 'c6', userId: 'user4', userName: 'Sophie Martin', text: 'Great video! Super helpful to see the pour technique.', createdAt: Date.now() - 72000000 }
    ],
    user: MOCK_USERS[4],
    isPublic: true
  },
  {
    id: 'mock6',
    createdAt: Date.now() - 172800000,
    media: { type: 'image', thumbnail: null },
    params: {
      milkType: '2%', milkPitcher: '17oz', spoutTip: 'Wide', cupType: 'Ceramic mug',
      cupVolumeMl: 180, espressoGrams: 34, milkTempF: 138,
      artPattern: 'Latte bear', aerationTimeSec: 6, integrationTimeSec: 8
    },
    beans: { brand: 'Verve', name: 'Streetlevel' },
    rating: 4.5,
    notes: 'Made a bear for my niece',
    comments: [
      { id: 'c7', userId: 'user1', userName: 'Emma Chen', text: 'So cute! I bet she loved it 🐻', createdAt: Date.now() - 160000000 }
    ],
    user: MOCK_USERS[5],
    isPublic: true
  },
];

/**
 * Get community feed (from Firestore public feed + mock entries as fallback)
 */
async function getCommunityFeed(filter = {}) {
  const profile = getProfile();

  // Fetch real public entries from Firestore
  let publicEntries = [];
  try {
    publicEntries = await getPublicFeedCached();
  } catch (error) {
    console.error('Error fetching public feed, using mock data:', error);
  }

  // Add mock entries as fallback/demo content if no real entries
  let feed = publicEntries.length > 0 ? [...publicEntries] : [...MOCK_ENTRIES];

  // Also include user's own public entries (in case they haven't synced yet)
  const localPublicEntries = getEntries()
    .filter(e => e.isPublic)
    .filter(e => !feed.some(f => f.id === e.id)) // Avoid duplicates
    .map(e => ({
      ...e,
      user: {
        id: profile.id,
        odId: getCurrentUserId(),
        name: profile.name || 'You',
        location: profile.location
      }
    }));

  feed = [...feed, ...localPublicEntries];

  // Sort by date
  feed.sort((a, b) => b.createdAt - a.createdAt);

  // Filter by location
  if (filter.country) {
    feed = feed.filter(e => e.user?.location?.country === filter.country);
  }
  if (filter.state) {
    feed = feed.filter(e => e.user?.location?.state === filter.state);
  }
  if (filter.city) {
    feed = feed.filter(e => e.user?.location?.city === filter.city);
  }

  // Filter by pattern
  if (filter.pattern) {
    feed = feed.filter(e => e.params?.artPattern === filter.pattern);
  }

  // Filter by following
  if (filter.following) {
    const following = getFollowing();
    feed = feed.filter(e => following.includes(e.user?.id) || following.includes(e.user?.odId));
  }

  return feed;
}

/**
 * Get unique locations from feed
 */
function getFeedLocations() {
  const feed = getCommunityFeed();
  const locations = {
    countries: new Set(),
    states: new Set(),
    cities: new Set()
  };

  feed.forEach(entry => {
    if (entry.user.location) {
      if (entry.user.location.country) locations.countries.add(entry.user.location.country);
      if (entry.user.location.state) locations.states.add(entry.user.location.state);
      if (entry.user.location.city) locations.cities.add(entry.user.location.city);
    }
  });

  return {
    countries: Array.from(locations.countries).sort(),
    states: Array.from(locations.states).sort(),
    cities: Array.from(locations.cities).sort()
  };
}

/**
 * Add comment to mock entry (stores in localStorage)
 * @param {string} parentId - Optional parent comment ID for replies
 */
function addMockComment(entryId, commentText, parentId = null) {
  const profile = getProfile();
  const comment = {
    id: generateId(),
    userId: profile.id,
    userName: profile.name || 'Anonymous',
    text: commentText,
    createdAt: Date.now(),
    updatedAt: null,
    upvotes: 0,
    downvotes: 0,
    parentId: parentId
  };

  // Store mock comments separately
  const mockCommentsKey = `mock_comments_${entryId}`;
  const existing = localStorage.getItem(mockCommentsKey);
  const comments = existing ? JSON.parse(existing) : [];
  comments.push(comment);
  localStorage.setItem(mockCommentsKey, JSON.stringify(comments));

  // If replying to someone, notify them
  if (parentId) {
    const allComments = getMockComments(entryId);
    const parentComment = allComments.find(c => c.id === parentId);
    if (parentComment && parentComment.userId !== profile.id) {
      createNotification(
        'comment',
        `${profile.name || 'Someone'} replied to your comment`,
        `post.html?id=${entryId}&mock=true`
      );
    }
  }

  return comment;
}

/**
 * Edit a mock comment
 */
function editMockComment(entryId, commentId, newText) {
  const profile = getProfile();
  const mockCommentsKey = `mock_comments_${entryId}`;
  const existing = localStorage.getItem(mockCommentsKey);
  const comments = existing ? JSON.parse(existing) : [];

  const index = comments.findIndex(c => c.id === commentId);
  if (index === -1) return null;

  // Only allow editing own comments
  if (comments[index].userId !== profile.id) return null;

  comments[index].text = newText;
  comments[index].updatedAt = Date.now();

  localStorage.setItem(mockCommentsKey, JSON.stringify(comments));
  return comments[index];
}

/**
 * Delete a mock comment
 */
function deleteMockComment(entryId, commentId) {
  const profile = getProfile();
  const mockCommentsKey = `mock_comments_${entryId}`;
  const existing = localStorage.getItem(mockCommentsKey);
  let comments = existing ? JSON.parse(existing) : [];

  const comment = comments.find(c => c.id === commentId);
  if (!comment || comment.userId !== profile.id) return false;

  // Remove the comment and its replies
  comments = comments.filter(c => c.id !== commentId && c.parentId !== commentId);
  localStorage.setItem(mockCommentsKey, JSON.stringify(comments));
  return true;
}

/**
 * Get comments for mock entry (with vote counts)
 */
function getMockComments(entryId) {
  console.log('getMockComments called:', entryId);
  const mockEntry = MOCK_ENTRIES.find(e => e.id === entryId);
  const baseComments = mockEntry?.comments || [];
  console.log('Base comments from mock entry:', baseComments.length);

  // Get user-added comments
  const mockCommentsKey = `mock_comments_${entryId}`;
  const existing = localStorage.getItem(mockCommentsKey);
  console.log('localStorage key:', mockCommentsKey, 'value:', existing);
  const userComments = existing ? JSON.parse(existing) : [];
  console.log('User comments:', userComments.length);

  // Get vote counts
  const mockVotesKey = `mock_votes_${entryId}`;
  const voteCountsData = localStorage.getItem(mockVotesKey);
  const voteCounts = voteCountsData ? JSON.parse(voteCountsData) : {};

  // Merge comments and add vote counts
  const allComments = [...baseComments, ...userComments].map(comment => ({
    ...comment,
    upvotes: voteCounts[comment.id]?.upvotes || comment.upvotes || 0,
    downvotes: voteCounts[comment.id]?.downvotes || comment.downvotes || 0
  }));

  return allComments.sort((a, b) => a.createdAt - b.createdAt);
}

// ==========================================
// Notification Functions
// ==========================================

/**
 * Get all notifications
 */
function getNotifications() {
  const data = localStorage.getItem(NOTIFICATIONS_KEY);
  if (data) return JSON.parse(data);

  // Create demo notifications for first-time users
  const demoNotifications = [
    {
      id: generateId(),
      type: 'comment',
      message: 'Emma Chen commented on a post: "Beautiful rosetta! Love the definition."',
      link: 'post.html?id=mock1&mock=true',
      read: false,
      createdAt: Date.now() - 3600000
    },
    {
      id: generateId(),
      type: 'follow',
      message: 'Marco Rossi started following you!',
      link: null,
      read: false,
      createdAt: Date.now() - 7200000
    },
    {
      id: generateId(),
      type: 'upvote',
      message: 'Your comment received 5 upvotes on "Tulip" post',
      link: 'post.html?id=mock2&mock=true',
      read: true,
      createdAt: Date.now() - 86400000
    }
  ];
  saveNotifications(demoNotifications);
  return demoNotifications;
}

/**
 * Save notifications
 */
function saveNotifications(notifications) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

/**
 * Create a notification
 * @param {string} type - 'comment', 'follow', 'upvote', 'mention'
 * @param {string} message - Notification message
 * @param {string} link - Optional link to navigate to
 */
function createNotification(type, message, link = null) {
  const notifications = getNotifications();
  const notification = {
    id: generateId(),
    type,
    message,
    link,
    read: false,
    createdAt: Date.now()
  };

  notifications.unshift(notification);

  // Keep only last 50 notifications
  if (notifications.length > 50) {
    notifications.pop();
  }

  saveNotifications(notifications);
  return notification;
}

/**
 * Mark a notification as read
 */
function markNotificationRead(notificationId) {
  const notifications = getNotifications();
  const index = notifications.findIndex(n => n.id === notificationId);

  if (index !== -1) {
    notifications[index].read = true;
    saveNotifications(notifications);
  }
}

/**
 * Mark all notifications as read
 */
function markAllNotificationsRead() {
  const notifications = getNotifications();
  notifications.forEach(n => n.read = true);
  saveNotifications(notifications);
}

/**
 * Get count of unread notifications
 */
function getUnreadNotificationCount() {
  const notifications = getNotifications();
  return notifications.filter(n => !n.read).length;
}

/**
 * Clear all notifications
 */
function clearNotifications() {
  saveNotifications([]);
}

// ==========================================
// Comment Voting Functions
// ==========================================

/**
 * Get all votes (stored by entry and comment)
 */
function getVotes() {
  const data = localStorage.getItem(VOTES_KEY);
  return data ? JSON.parse(data) : {};
}

/**
 * Save votes
 */
function saveVotes(votes) {
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}

/**
 * Get user's vote on a comment
 * @returns {number} 1 for upvote, -1 for downvote, 0 for no vote
 */
function getCommentVote(entryId, commentId) {
  const votes = getVotes();
  const key = `${entryId}_${commentId}`;
  return votes[key] || 0;
}

/**
 * Vote on a comment (for local entries)
 * @param {string} entryId - Entry ID
 * @param {string} commentId - Comment ID
 * @param {number} vote - 1 for upvote, -1 for downvote
 */
function voteComment(entryId, commentId, vote) {
  const entries = getEntries();
  const entryIndex = entries.findIndex(e => e.id === entryId);

  if (entryIndex === -1) return;

  const entry = entries[entryIndex];
  if (!entry.comments) return;

  const commentIndex = entry.comments.findIndex(c => c.id === commentId);
  if (commentIndex === -1) return;

  const comment = entry.comments[commentIndex];
  const votes = getVotes();
  const key = `${entryId}_${commentId}`;
  const previousVote = votes[key] || 0;

  // Initialize vote counts if not present
  if (!comment.upvotes) comment.upvotes = 0;
  if (!comment.downvotes) comment.downvotes = 0;

  // Remove previous vote
  if (previousVote === 1) {
    comment.upvotes = Math.max(0, comment.upvotes - 1);
  } else if (previousVote === -1) {
    comment.downvotes = Math.max(0, comment.downvotes - 1);
  }

  // Apply new vote (if same vote, toggle off)
  if (previousVote === vote) {
    votes[key] = 0;
  } else {
    votes[key] = vote;
    if (vote === 1) {
      comment.upvotes++;
    } else if (vote === -1) {
      comment.downvotes++;
    }
  }

  // Save updates
  entries[entryIndex].comments[commentIndex] = comment;
  saveEntries(entries);
  saveVotes(votes);

  // Create notification for upvotes on own entries
  const profile = getProfile();
  if (vote === 1 && comment.userId !== profile.id) {
    // This would notify the comment author in a real system
  }
}

/**
 * Vote on a mock entry comment
 */
function voteMockComment(entryId, commentId, vote) {
  const votes = getVotes();
  const key = `${entryId}_${commentId}`;
  const previousVote = votes[key] || 0;

  // Get mock comments storage
  const mockCommentsKey = `mock_comments_${entryId}`;
  const mockVotesKey = `mock_votes_${entryId}`;

  // Get existing vote counts for mock comments
  const voteCountsData = localStorage.getItem(mockVotesKey);
  const voteCounts = voteCountsData ? JSON.parse(voteCountsData) : {};

  if (!voteCounts[commentId]) {
    voteCounts[commentId] = { upvotes: 0, downvotes: 0 };
  }

  // Remove previous vote
  if (previousVote === 1) {
    voteCounts[commentId].upvotes = Math.max(0, voteCounts[commentId].upvotes - 1);
  } else if (previousVote === -1) {
    voteCounts[commentId].downvotes = Math.max(0, voteCounts[commentId].downvotes - 1);
  }

  // Apply new vote (if same vote, toggle off)
  if (previousVote === vote) {
    votes[key] = 0;
  } else {
    votes[key] = vote;
    if (vote === 1) {
      voteCounts[commentId].upvotes++;
    } else if (vote === -1) {
      voteCounts[commentId].downvotes++;
    }
  }

  // Save updates
  saveVotes(votes);
  localStorage.setItem(mockVotesKey, JSON.stringify(voteCounts));
}

/**
 * Get vote counts for a mock comment
 */
function getMockCommentVotes(entryId, commentId) {
  const mockVotesKey = `mock_votes_${entryId}`;
  const voteCountsData = localStorage.getItem(mockVotesKey);
  const voteCounts = voteCountsData ? JSON.parse(voteCountsData) : {};
  return voteCounts[commentId] || { upvotes: 0, downvotes: 0 };
}

// ==========================================
// Saved Comments Functions
// ==========================================

/**
 * Get all saved comment IDs
 */
function getSavedComments() {
  const data = localStorage.getItem(SAVED_COMMENTS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save a comment
 */
function saveCommentToList(entryId, commentId) {
  const saved = getSavedComments();
  const key = `${entryId}_${commentId}`;
  if (!saved.includes(key)) {
    saved.push(key);
    localStorage.setItem(SAVED_COMMENTS_KEY, JSON.stringify(saved));
  }
}

/**
 * Unsave a comment
 */
function unsaveComment(entryId, commentId) {
  const saved = getSavedComments();
  const key = `${entryId}_${commentId}`;
  const filtered = saved.filter(k => k !== key);
  localStorage.setItem(SAVED_COMMENTS_KEY, JSON.stringify(filtered));
}

/**
 * Check if a comment is saved
 */
function isCommentSaved(entryId, commentId) {
  const saved = getSavedComments();
  const key = `${entryId}_${commentId}`;
  return saved.includes(key);
}

/**
 * Report a comment
 */
function reportComment(entryId, commentId, reason = '') {
  const reported = getReportedComments();
  const key = `${entryId}_${commentId}`;

  // Store the report
  reported[key] = {
    entryId,
    commentId,
    reason,
    reportedAt: Date.now()
  };

  localStorage.setItem(REPORTED_COMMENTS_KEY, JSON.stringify(reported));
  return true;
}

/**
 * Get reported comments
 */
function getReportedComments() {
  const data = localStorage.getItem(REPORTED_COMMENTS_KEY);
  return data ? JSON.parse(data) : {};
}

/**
 * Check if a comment has been reported
 */
function isCommentReported(entryId, commentId) {
  const reported = getReportedComments();
  const key = `${entryId}_${commentId}`;
  return !!reported[key];
}

// ==========================================
// Loadout Functions (Equipment Presets)
// ==========================================

/**
 * Get all saved loadouts
 */
function getLoadouts() {
  const data = localStorage.getItem(LOADOUTS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save loadouts array
 */
function saveLoadouts(loadouts) {
  localStorage.setItem(LOADOUTS_KEY, JSON.stringify(loadouts));
}

/**
 * Create a new loadout
 */
function createLoadout(name, params) {
  const loadouts = getLoadouts();

  const loadout = {
    id: generateId(),
    name: name,
    createdAt: Date.now(),
    params: {
      milkType: params.milkType || '',
      milkPitcher: params.milkPitcher || '',
      spoutTip: params.spoutTip || '',
      cupType: params.cupType || '',
      cupVolumeMl: params.cupVolumeMl || '',
      espressoGrams: params.espressoGrams || '',
      milkTempF: params.milkTempF || '',
      aerationTimeSec: params.aerationTimeSec || '',
      integrationTimeSec: params.integrationTimeSec || ''
    },
    beans: params.beans || null
  };

  loadouts.push(loadout);
  saveLoadouts(loadouts);
  return loadout;
}

/**
 * Update an existing loadout
 */
function updateLoadout(id, name, params) {
  const loadouts = getLoadouts();
  const index = loadouts.findIndex(l => l.id === id);

  if (index === -1) return null;

  loadouts[index].name = name;
  loadouts[index].params = {
    milkType: params.milkType || '',
    milkPitcher: params.milkPitcher || '',
    spoutTip: params.spoutTip || '',
    cupType: params.cupType || '',
    cupVolumeMl: params.cupVolumeMl || '',
    espressoGrams: params.espressoGrams || '',
    milkTempF: params.milkTempF || '',
    aerationTimeSec: params.aerationTimeSec || '',
    integrationTimeSec: params.integrationTimeSec || ''
  };
  loadouts[index].beans = params.beans || null;

  saveLoadouts(loadouts);
  return loadouts[index];
}

/**
 * Delete a loadout
 */
function deleteLoadout(id) {
  const loadouts = getLoadouts();
  const filtered = loadouts.filter(l => l.id !== id);
  saveLoadouts(filtered);

  // Clear active loadout if it was the deleted one
  if (getActiveLoadoutId() === id) {
    setActiveLoadoutId(null);
  }
}

/**
 * Get a single loadout by ID
 */
function getLoadout(id) {
  const loadouts = getLoadouts();
  return loadouts.find(l => l.id === id) || null;
}

/**
 * Get the currently active loadout ID
 */
function getActiveLoadoutId() {
  return localStorage.getItem(ACTIVE_LOADOUT_KEY) || null;
}

/**
 * Set the active loadout ID
 */
function setActiveLoadoutId(id) {
  if (id) {
    localStorage.setItem(ACTIVE_LOADOUT_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_LOADOUT_KEY);
  }
}

/**
 * Get the currently active loadout
 */
function getActiveLoadout() {
  const id = getActiveLoadoutId();
  return id ? getLoadout(id) : null;
}

// ==========================================
// Smart Defaults Functions
// ==========================================

/**
 * Get smart defaults (last-used values)
 */
function getSmartDefaults() {
  const data = localStorage.getItem(SMART_DEFAULTS_KEY);
  return data ? JSON.parse(data) : {};
}

/**
 * Save smart defaults after creating/updating an entry
 */
function saveSmartDefaults(entryData) {
  const defaults = {
    milkType: entryData.params.milkType || '',
    milkPitcher: entryData.params.milkPitcher || '',
    spoutTip: entryData.params.spoutTip || '',
    cupType: entryData.params.cupType || '',
    cupVolumeMl: entryData.params.cupVolumeMl || '',
    espressoGrams: entryData.params.espressoGrams || '',
    milkTempF: entryData.params.milkTempF || '',
    aerationTimeSec: entryData.params.aerationTimeSec || '',
    integrationTimeSec: entryData.params.integrationTimeSec || '',
    beanBrand: entryData.beans?.brand || '',
    beanName: entryData.beans?.name || '',
    isPublic: entryData.isPublic !== undefined ? entryData.isPublic : true,
    updatedAt: Date.now()
  };
  localStorage.setItem(SMART_DEFAULTS_KEY, JSON.stringify(defaults));
}

/**
 * Clear smart defaults
 */
function clearSmartDefaults() {
  localStorage.removeItem(SMART_DEFAULTS_KEY);
}

// ==========================================
// Draft Functions (for unsaved form data)
// ==========================================

/**
 * Save entry draft
 */
function saveEntryDraft(draftData) {
  const draft = {
    ...draftData,
    savedAt: Date.now()
  };
  localStorage.setItem(ENTRY_DRAFT_KEY, JSON.stringify(draft));
}

/**
 * Get entry draft
 */
function getEntryDraft() {
  const data = localStorage.getItem(ENTRY_DRAFT_KEY);
  if (!data) return null;

  const draft = JSON.parse(data);

  // Expire drafts older than 24 hours
  if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
    clearEntryDraft();
    return null;
  }

  return draft;
}

/**
 * Clear entry draft
 */
function clearEntryDraft() {
  localStorage.removeItem(ENTRY_DRAFT_KEY);
}

/**
 * Check if a draft exists
 */
function hasEntryDraft() {
  return !!getEntryDraft();
}

// Export for use in other modules
window.Storage = {
  initDB,
  generateId,
  getEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  getMedia,
  getSettings,
  saveSettings,
  getProfile,
  saveProfile,
  saveProfilePicture,
  getProfilePicture,
  removeProfilePicture,
  getFollowing,
  followUser,
  unfollowUser,
  isFollowing,
  convertTemp,
  convertVolume,
  convertWeight,
  formatVolume,
  formatWeight,
  formatTemp,
  formatRating,
  renderStarRating,
  getCommunityFeed,
  getFeedLocations,
  addComment,
  editComment,
  deleteComment,
  getComments,
  addMockComment,
  editMockComment,
  deleteMockComment,
  getMockComments,
  // Notifications
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  clearNotifications,
  // Voting
  getCommentVote,
  voteComment,
  voteMockComment,
  getMockCommentVotes,
  // Saved/Reported Comments
  getSavedComments,
  saveCommentToList,
  unsaveComment,
  isCommentSaved,
  reportComment,
  isCommentReported,
  // Loadouts
  getLoadouts,
  createLoadout,
  updateLoadout,
  deleteLoadout,
  getLoadout,
  getActiveLoadoutId,
  setActiveLoadoutId,
  getActiveLoadout,
  // Cloud Sync
  getCurrentUserId,
  syncEntryToCloud,
  syncAllToCloud,
  syncFromCloud,
  performFullSync,
  syncProfileToCloud,
  syncProfileFromCloud,
  // Smart Defaults
  getSmartDefaults,
  saveSmartDefaults,
  clearSmartDefaults,
  // Draft
  saveEntryDraft,
  getEntryDraft,
  clearEntryDraft,
  hasEntryDraft,
  // Constants
  MOCK_USERS,
  MOCK_ENTRIES,
  SPOUT_TIPS
};

