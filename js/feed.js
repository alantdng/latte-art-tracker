/**
 * Community Feed module for Latte'd app
 * Handles the social feed of latte art from other users
 */

// Placeholder images for mock data (coffee-themed colors)
const PLACEHOLDER_COLORS = [
  '#8B4513', '#A0522D', '#D2691E', '#CD853F', '#DEB887',
  '#D2B48C', '#BC8F8F', '#F4A460', '#DAA520', '#B8860B'
];

/**
 * Generate a placeholder thumbnail for mock entries
 */
function getPlaceholderImage(entryId, pattern) {
  const colorIndex = entryId.charCodeAt(4) % PLACEHOLDER_COLORS.length;
  const color = PLACEHOLDER_COLORS[colorIndex];

  // Create a simple SVG placeholder
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="${color}"/>
      <circle cx="100" cy="100" r="70" fill="#FFF5E6" opacity="0.9"/>
      <text x="100" y="105" text-anchor="middle" fill="${color}" font-family="system-ui" font-size="14" font-weight="600">${pattern}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Format location string
 */
function formatLocation(location) {
  if (!location) return '';
  const parts = [location.city, location.state, location.country].filter(Boolean);
  return parts.join(', ');
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Render star rating display
 */
function renderStars(rating) {
  if (!rating) return '';
  let html = '<span class="feed-rating">';
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      html += '<span class="star full">★</span>';
    } else if (rating >= i - 0.5) {
      html += '<span class="star half">★</span>';
    } else {
      html += '<span class="star empty">☆</span>';
    }
  }
  html += '</span>';
  return html;
}

/**
 * Render the community feed
 */
function renderFeed(filter = {}) {
  const container = document.getElementById('feed-grid');
  const emptyState = document.getElementById('feed-empty');
  const feed = Storage.getCommunityFeed(filter);
  const settings = Storage.getSettings();
  const profile = Storage.getProfile();

  if (feed.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  container.style.display = 'grid';
  emptyState.style.display = 'none';

  container.innerHTML = feed.map(entry => {
    const thumbnail = entry.media.thumbnail || getPlaceholderImage(entry.id, entry.params.artPattern);
    const location = formatLocation(entry.user.location);
    const timeAgo = formatRelativeTime(entry.createdAt);
    const isVideo = entry.media.type === 'video';
    const isOwnEntry = entry.user.id === profile.id;
    const isFollowing = Storage.isFollowing(entry.user.id);
    const isMock = entry.id.startsWith('mock');

    // Get comments
    const comments = isMock ? Storage.getMockComments(entry.id) : (entry.comments || []);
    const commentCount = comments.length;

    return `
      <article class="feed-card" data-id="${entry.id}" data-mock="${isMock}">
        <div class="feed-card-header">
          <div class="feed-user-info">
            <a href="user-profile.html?id=${entry.user.id}&mock=${isMock}" class="feed-avatar-link" onclick="event.stopPropagation();">
              <div class="feed-avatar">${entry.user.name.charAt(0).toUpperCase()}</div>
            </a>
            <div class="feed-user-details">
              <a href="user-profile.html?id=${entry.user.id}&mock=${isMock}" class="feed-username feed-username-link" onclick="event.stopPropagation();">${entry.user.name}</a>
              ${location ? `<span class="feed-location">${location}</span>` : ''}
            </div>
          </div>
          ${!isOwnEntry && !isMock ? `
            <button class="btn-follow ${isFollowing ? 'following' : ''}" data-user-id="${entry.user.id}">
              ${isFollowing ? 'Following' : 'Follow'}
            </button>
          ` : ''}
        </div>
        <div class="feed-card-media">
          <img src="${thumbnail}" alt="${entry.params.artPattern} latte art">
          ${isVideo ? '<span class="video-badge">Video</span>' : ''}
        </div>
        <div class="feed-card-info">
          <div class="feed-pattern-row">
            <h3 class="feed-pattern">${entry.params.artPattern}</h3>
            ${entry.rating ? renderStars(entry.rating) : ''}
          </div>
          <div class="feed-params">
            <span>${entry.params.milkType}</span>
            <span>${Storage.formatTemp(entry.params.milkTempF, settings)}</span>
            <span>${Storage.formatVolume(entry.params.cupVolumeMl, settings)}</span>
          </div>
          ${entry.beans ? `
            <div class="feed-beans">
              <span class="beans-icon">☕</span>
              ${entry.beans.brand || ''} ${entry.beans.name || ''}
            </div>
          ` : ''}
          ${entry.notes ? `<p class="feed-notes">${entry.notes}</p>` : ''}
          <div class="feed-meta-row">
            <span class="feed-time">${timeAgo}</span>
            <button class="btn-comments" data-id="${entry.id}" data-mock="${isMock}">
              💬 ${commentCount} comment${commentCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Add click handlers for cards (view details) - navigate to post page
  container.querySelectorAll('.feed-card-media').forEach(media => {
    media.addEventListener('click', () => {
      const card = media.closest('.feed-card');
      const id = card.dataset.id;
      const isMock = card.dataset.mock === 'true';
      window.location.href = `post.html?id=${id}&mock=${isMock}`;
    });
  });

  // Add click handlers for follow buttons
  container.querySelectorAll('.btn-follow').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;

      if (Storage.isFollowing(userId)) {
        Storage.unfollowUser(userId);
        btn.classList.remove('following');
        btn.textContent = 'Follow';
      } else {
        Storage.followUser(userId);
        btn.classList.add('following');
        btn.textContent = 'Following';
      }
    });
  });

  // Add click handlers for comments button - navigate to post page
  container.querySelectorAll('.btn-comments').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const isMock = btn.dataset.mock === 'true';
      window.location.href = `post.html?id=${id}&mock=${isMock}#comments`;
    });
  });
}

/**
 * Update filter dropdowns
 */
function updateFilters() {
  const locations = Storage.getFeedLocations();

  const countrySelect = document.getElementById('filter-country');
  if (countrySelect) {
    countrySelect.innerHTML = '<option value="">All Countries</option>' +
      locations.countries.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  const patternSelect = document.getElementById('filter-pattern');
  if (patternSelect) {
    const patterns = ['Heart', 'Tulip', 'Rosetta', 'Swan', 'Latte bear', 'Winged tulip', 'Blank'];
    patternSelect.innerHTML = '<option value="">All Patterns</option>' +
      patterns.map(p => `<option value="${p}">${p}</option>`).join('');
  }
}

/**
 * Get current filter values
 */
function getFilterValues() {
  return {
    country: document.getElementById('filter-country')?.value || '',
    pattern: document.getElementById('filter-pattern')?.value || '',
    following: document.getElementById('filter-following')?.checked || false
  };
}

/**
 * Initialize feed page
 */
function initFeed() {
  updateFilters();
  renderFeed();

  // Set up filter change handlers
  ['filter-country', 'filter-pattern', 'filter-following'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        renderFeed(getFilterValues());
      });
    }
  });

  // Set up hamburger menu
  setupHamburgerMenu();
}

/**
 * Set up hamburger menu
 */
function setupHamburgerMenu() {
  const btn = document.getElementById('hamburger-btn');
  const menu = document.getElementById('hamburger-menu');

  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
    btn.classList.toggle('active');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add('hidden');
      btn.classList.remove('active');
    }
  });

  // Update notification badge
  const badge = document.getElementById('menu-notif-badge');
  const unreadCount = Storage.getUnreadNotificationCount();
  if (badge && unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  }
}

// Export
window.Feed = {
  init: initFeed,
  render: renderFeed
};
