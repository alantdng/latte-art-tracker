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

let db = null;

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

  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
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
    const transaction = db.transaction([MEDIA_STORE], 'readwrite');
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
    const transaction = db.transaction([MEDIA_STORE], 'readonly');
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
    const transaction = db.transaction([MEDIA_STORE], 'readwrite');
    const store = transaction.objectStore(MEDIA_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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

  await saveMedia(id, mediaBlob);

  const entries = getEntries();
  entries.unshift(entry);
  saveEntries(entries);

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
      thumbnail
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
}

/**
 * Add a comment to an entry
 */
function addComment(entryId, commentText) {
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
    upvotes: 0,
    downvotes: 0
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

  return comment;
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
 * Get community feed (mock + public local entries)
 */
function getCommunityFeed(filter = {}) {
  const profile = getProfile();
  const localEntries = getEntries()
    .filter(e => e.isPublic)
    .map(e => ({
      ...e,
      user: {
        id: profile.id,
        name: profile.name || 'You',
        location: profile.location
      }
    }));

  let feed = [...MOCK_ENTRIES, ...localEntries];

  // Sort by date
  feed.sort((a, b) => b.createdAt - a.createdAt);

  // Filter by location
  if (filter.country) {
    feed = feed.filter(e => e.user.location?.country === filter.country);
  }
  if (filter.state) {
    feed = feed.filter(e => e.user.location?.state === filter.state);
  }
  if (filter.city) {
    feed = feed.filter(e => e.user.location?.city === filter.city);
  }

  // Filter by pattern
  if (filter.pattern) {
    feed = feed.filter(e => e.params.artPattern === filter.pattern);
  }

  // Filter by following
  if (filter.following) {
    const following = getFollowing();
    feed = feed.filter(e => following.includes(e.user.id));
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
 */
function addMockComment(entryId, commentText) {
  const profile = getProfile();
  const comment = {
    id: generateId(),
    userId: profile.id,
    userName: profile.name || 'Anonymous',
    text: commentText,
    createdAt: Date.now(),
    upvotes: 0,
    downvotes: 0
  };

  // Store mock comments separately
  const mockCommentsKey = `mock_comments_${entryId}`;
  const existing = localStorage.getItem(mockCommentsKey);
  const comments = existing ? JSON.parse(existing) : [];
  comments.push(comment);
  localStorage.setItem(mockCommentsKey, JSON.stringify(comments));

  // Simulate a notification from the post author (after a delay in real app)
  const mockEntry = MOCK_ENTRIES.find(e => e.id === entryId);
  if (mockEntry) {
    // Random chance of getting a reply notification (simulates async backend)
    if (Math.random() > 0.5) {
      setTimeout(() => {
        createNotification(
          'comment',
          `${mockEntry.user.name} replied to your comment on their ${mockEntry.params.artPattern} post`,
          `post.html?id=${entryId}&mock=true`
        );
      }, 2000);
    }
  }

  return comment;
}

/**
 * Get comments for mock entry (with vote counts)
 */
function getMockComments(entryId) {
  const mockEntry = MOCK_ENTRIES.find(e => e.id === entryId);
  const baseComments = mockEntry?.comments || [];

  // Get user-added comments
  const mockCommentsKey = `mock_comments_${entryId}`;
  const existing = localStorage.getItem(mockCommentsKey);
  const userComments = existing ? JSON.parse(existing) : [];

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
  getComments,
  addMockComment,
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
  // Loadouts
  getLoadouts,
  createLoadout,
  updateLoadout,
  deleteLoadout,
  getLoadout,
  getActiveLoadoutId,
  setActiveLoadoutId,
  getActiveLoadout,
  // Constants
  MOCK_USERS,
  MOCK_ENTRIES,
  SPOUT_TIPS
};

