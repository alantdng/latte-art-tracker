/**
 * User Profile page module for Latte'd app
 * Displays another user's profile, posts, and stats
 */

// Placeholder images for mock data
const PLACEHOLDER_COLORS = [
  '#8B4513', '#A0522D', '#D2691E', '#CD853F', '#DEB887',
  '#D2B48C', '#BC8F8F', '#F4A460', '#DAA520', '#B8860B'
];

/**
 * Generate a placeholder thumbnail
 */
function getPlaceholderImage(entryId, pattern) {
  const colorIndex = entryId.charCodeAt(4) % PLACEHOLDER_COLORS.length;
  const color = PLACEHOLDER_COLORS[colorIndex];

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
 * Render star rating for cards
 */
function renderStarsSmall(rating) {
  if (!rating) return '';
  let html = '<span class="card-rating">';
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
 * Initialize user profile page
 */
async function initUserProfile() {
  try {
    await Storage.initDB();

    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');
    const isMock = params.get('mock') === 'true';

    if (!userId) {
      window.location.href = 'index.html';
      return;
    }

    const myProfile = Storage.getProfile();
    const isOwnProfile = userId === myProfile.id;

    // Get user info
    let user = null;
    let userPosts = [];

    if (isMock) {
      // Mock user
      user = Storage.MOCK_USERS.find(u => u.id === userId);
      if (!user) {
        alert('User not found');
        window.location.href = 'index.html';
        return;
      }
      // Get mock user's posts
      userPosts = Storage.MOCK_ENTRIES.filter(e => e.user.id === userId);
    } else if (isOwnProfile) {
      // Own profile - redirect to profile.html
      window.location.href = 'profile.html';
      return;
    } else {
      // Other real user (not implemented yet - would require backend)
      alert('User not found');
      window.location.href = 'index.html';
      return;
    }

    // Render user header
    document.getElementById('profile-avatar').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('profile-name').textContent = user.name;

    const location = formatLocation(user.location);
    const locationEl = document.getElementById('profile-location');
    if (location) {
      locationEl.textContent = location;
    } else {
      locationEl.style.display = 'none';
    }

    // Follow button (only for mock users, not own profile)
    if (isMock && !isOwnProfile) {
      const followBtn = document.getElementById('follow-btn');
      const isFollowing = Storage.isFollowing(userId);
      followBtn.classList.remove('hidden');
      followBtn.classList.toggle('following', isFollowing);
      followBtn.textContent = isFollowing ? 'Following' : 'Follow';

      followBtn.addEventListener('click', () => {
        // Check if user is logged in
        if (!Auth.requireAuthForAction('follow users')) {
          return;
        }

        if (Storage.isFollowing(userId)) {
          Storage.unfollowUser(userId);
          followBtn.classList.remove('following');
          followBtn.textContent = 'Follow';
        } else {
          Storage.followUser(userId);
          followBtn.classList.add('following');
          followBtn.textContent = 'Following';
        }
      });
    }

    // Stats
    const patterns = new Set(userPosts.map(e => e.params.artPattern));
    document.getElementById('stat-posts').textContent = userPosts.length;
    document.getElementById('stat-patterns').textContent = patterns.size;

    // Render posts grid
    const postsGrid = document.getElementById('posts-grid');
    const postsEmpty = document.getElementById('posts-empty');
    const settings = Storage.getSettings();

    if (userPosts.length === 0) {
      postsGrid.style.display = 'none';
      postsEmpty.classList.remove('hidden');
    } else {
      postsGrid.style.display = 'grid';
      postsEmpty.classList.add('hidden');

      postsGrid.innerHTML = userPosts.map(entry => {
        const thumbnail = entry.media.thumbnail || getPlaceholderImage(entry.id, entry.params.artPattern);
        const isVideo = entry.media.type === 'video';
        const temp = Storage.formatTemp(entry.params.milkTempF, settings);

        return `
          <article class="gallery-card" data-id="${entry.id}" data-mock="true">
            <div class="card-media">
              <img src="${thumbnail}" alt="${entry.params.artPattern} latte art">
              ${isVideo ? '<span class="video-badge">Video</span>' : ''}
            </div>
            <div class="card-info">
              <div class="card-title-row">
                <h3 class="card-pattern">${entry.params.artPattern}</h3>
                ${entry.rating ? renderStarsSmall(entry.rating) : ''}
              </div>
              <div class="card-meta">
                <span>${entry.params.milkType}</span>
                <span>${temp}</span>
              </div>
            </div>
          </article>
        `;
      }).join('');

      // Add click handlers to posts
      postsGrid.querySelectorAll('.gallery-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          const mock = card.dataset.mock === 'true';
          window.location.href = `post.html?id=${id}&mock=${mock}`;
        });
      });
    }

    // Set up hamburger menu
    setupHamburgerMenu();

  } catch (error) {
    console.error('Error in initUserProfile:', error);
  }
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

  // Update notification badge (header icon)
  const badge = document.getElementById('notif-badge');
  const unreadCount = Storage.getUnreadNotificationCount();
  if (badge && unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initUserProfile);
