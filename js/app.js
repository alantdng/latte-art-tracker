/**
 * Main app module for Latte'd
 * Handles initialization and shared functionality
 */

/**
 * Initialize the app based on current page
 */
async function initApp() {
  try {
    await Storage.initDB();

    const path = window.location.pathname;

    if (path.endsWith('entry.html')) {
      if (typeof EntryForm !== 'undefined') EntryForm.init();
    } else if (path.endsWith('detail.html')) {
      initDetailPage();
    } else if (path.endsWith('my-lattes.html')) {
      if (typeof Gallery !== 'undefined') Gallery.init();
    } else if (path.endsWith('profile.html')) {
      initProfilePage();
    } else if (path.endsWith('post.html')) {
      return;
    } else if (path.endsWith('notifications.html')) {
      return;
    } else {
      if (typeof Feed !== 'undefined') Feed.init();
    }
  } catch (error) {
    console.error('Error in initApp:', error);
  }
}

/**
 * Initialize detail page
 */
async function initDetailPage() {
  // Set up hamburger menu
  setupHamburgerMenu();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    window.location.href = 'my-lattes.html';
    return;
  }

  const entry = Storage.getEntry(id);
  if (!entry) {
    alert('Entry not found');
    window.location.href = 'my-lattes.html';
    return;
  }

  const settings = Storage.getSettings();

  // Load media
  const mediaContainer = document.getElementById('detail-media');
  const mediaBlob = await Storage.getMedia(id);

  if (mediaBlob) {
    if (entry.media.type === 'image') {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(mediaBlob);
      img.alt = `${entry.params.artPattern} latte art`;
      mediaContainer.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(mediaBlob);
      video.controls = true;
      video.autoplay = false;
      video.muted = true;
      mediaContainer.appendChild(video);
    }
  }

  // Format date
  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  document.getElementById('detail-date').textContent = `${dateStr} at ${timeStr}`;
  document.getElementById('detail-pattern').textContent = entry.params.artPattern;

  // Show rating
  if (entry.rating) {
    const ratingContainer = document.getElementById('detail-rating');
    if (ratingContainer) {
      ratingContainer.innerHTML = renderStarsDisplay(entry.rating);
      ratingContainer.classList.remove('hidden');
    }
  }

  // Show public badge if shared
  if (entry.isPublic) {
    document.getElementById('detail-public-badge').classList.remove('hidden');
  }

  // Show beans if present
  if (entry.beans && (entry.beans.brand || entry.beans.name)) {
    const beansText = [entry.beans.brand, entry.beans.name].filter(Boolean).join(' - ');
    document.getElementById('detail-beans').textContent = beansText;
    document.getElementById('beans-section').classList.remove('hidden');
  }

  // Fill in parameters using formatted values
  document.getElementById('param-milk-type').textContent = entry.params.milkType;
  document.getElementById('param-milk-pitcher').textContent = entry.params.milkPitcher || '-';
  document.getElementById('param-spout-tip').textContent = entry.params.spoutTip || '-';
  document.getElementById('param-cup-type').textContent = entry.params.cupType || '-';
  document.getElementById('param-cup-volume').textContent = Storage.formatVolume(entry.params.cupVolumeMl, settings);
  document.getElementById('param-espresso').textContent = Storage.formatWeight(entry.params.espressoGrams, settings);
  document.getElementById('param-milk-temp').textContent = Storage.formatTemp(entry.params.milkTempF, settings);
  document.getElementById('param-aeration').textContent = entry.params.aerationTimeSec ? `${entry.params.aerationTimeSec} sec` : '-';
  document.getElementById('param-integration').textContent = entry.params.integrationTimeSec ? `${entry.params.integrationTimeSec} sec` : '-';

  // Notes
  const notesSection = document.getElementById('notes-section');
  const notesContent = document.getElementById('detail-notes');
  if (entry.notes) {
    notesContent.textContent = entry.notes;
    notesSection.classList.remove('hidden');
  }

  // Comments
  renderComments(id, entry.comments || []);

  // Set up edit button
  document.getElementById('edit-btn').addEventListener('click', () => {
    window.location.href = `entry.html?edit=${id}`;
  });

  // Set up delete button
  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete this entry? This cannot be undone.')) {
      await Storage.deleteEntry(id);
      window.location.href = 'my-lattes.html';
    }
  });

  // Set up comment form
  const commentInput = document.getElementById('comment-input');
  const submitBtn = document.getElementById('submit-comment');

  if (commentInput && submitBtn) {
    submitBtn.addEventListener('click', () => {
      submitLocalComment(id);
    });

    commentInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitLocalComment(id);
      }
    });
  }
}

/**
 * Render stars display
 */
function renderStarsDisplay(rating) {
  let html = '<span class="star-rating-display">';
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      html += '<span class="star full">★</span>';
    } else if (rating >= i - 0.5) {
      html += '<span class="star half">★</span>';
    } else {
      html += '<span class="star empty">☆</span>';
    }
  }
  html += ` <span class="rating-value">${rating}/5</span></span>`;
  return html;
}

/**
 * Render comments section
 */
function renderComments(entryId, comments) {
  const container = document.getElementById('comments-list');
  if (!container) return;

  if (comments.length === 0) {
    container.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
    return;
  }

  container.innerHTML = comments.map(comment => `
    <div class="comment">
      <div class="comment-avatar">${comment.userName.charAt(0).toUpperCase()}</div>
      <div class="comment-content">
        <div class="comment-header">
          <span class="comment-author">${comment.userName}</span>
          <span class="comment-time">${formatRelativeTime(comment.createdAt)}</span>
        </div>
        <p class="comment-text">${comment.text}</p>
      </div>
    </div>
  `).join('');
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
 * Submit comment on local entry
 */
function submitLocalComment(entryId) {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();

  if (!text) return;

  const result = Storage.addComment(entryId, text);

  if (!result) {
    console.error('Failed to add comment - entry not found:', entryId);
    alert('Failed to add comment. Please try again.');
    return;
  }

  // Refresh comments
  const entry = Storage.getEntry(entryId);
  renderComments(entryId, entry.comments || []);

  // Clear input
  input.value = '';
}

/**
 * Set up hamburger menu (shared function)
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

/**
 * Initialize profile page
 */
function initProfilePage() {
  const profile = Storage.getProfile();
  const settings = Storage.getSettings();

  // Set up hamburger menu
  setupHamburgerMenu();

  // Load profile values
  document.getElementById('profileName').value = profile.name || '';
  document.getElementById('profileCity').value = profile.location?.city || '';
  document.getElementById('profileState').value = profile.location?.state || '';
  document.getElementById('profileCountry').value = profile.location?.country || '';

  // Set up unit toggles
  document.querySelectorAll('.unit-btn').forEach(btn => {
    const unit = btn.dataset.unit;
    const value = btn.dataset.value;

    // Mark active button
    if (settings[unit] === value) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () => {
      // Update UI
      btn.parentElement.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Save setting
      settings[unit] = value;
      Storage.saveSettings(settings);
    });
  });

  // Load following list
  renderFollowingList();

  // Load stats
  const entries = Storage.getEntries();
  const publicCount = entries.filter(e => e.isPublic).length;
  const patterns = new Set(entries.map(e => e.params.artPattern));

  document.getElementById('stat-total').textContent = entries.length;
  document.getElementById('stat-public').textContent = publicCount;
  document.getElementById('stat-patterns').textContent = patterns.size;

  // Handle form submission
  document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const updatedProfile = {
      ...profile,
      name: document.getElementById('profileName').value.trim(),
      location: {
        city: document.getElementById('profileCity').value.trim(),
        state: document.getElementById('profileState').value.trim(),
        country: document.getElementById('profileCountry').value.trim()
      }
    };

    Storage.saveProfile(updatedProfile);

    // Show confirmation
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Saved!';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 1500);
  });
}

/**
 * Render the following list
 */
function renderFollowingList() {
  const container = document.getElementById('following-list');
  const following = Storage.getFollowing();

  if (following.length === 0) {
    container.innerHTML = '<p class="empty-following">You\'re not following anyone yet. Visit the community feed to find baristas!</p>';
    return;
  }

  // Get user info for followed users (from mock data)
  const mockUsers = Storage.MOCK_USERS || [];

  container.innerHTML = following.map(userId => {
    const user = mockUsers.find(u => u.id === userId);
    if (!user) return '';

    const location = user.location
      ? [user.location.city, user.location.state, user.location.country].filter(Boolean).join(', ')
      : '';

    return `
      <div class="following-item">
        <div class="following-avatar">${user.name.charAt(0).toUpperCase()}</div>
        <div class="following-info">
          <span class="following-name">${user.name}</span>
          ${location ? `<span class="following-location">${location}</span>` : ''}
        </div>
        <button class="btn-unfollow" data-user-id="${userId}">Unfollow</button>
      </div>
    `;
  }).join('');

  // Add unfollow handlers
  container.querySelectorAll('.btn-unfollow').forEach(btn => {
    btn.addEventListener('click', () => {
      Storage.unfollowUser(btn.dataset.userId);
      renderFollowingList();
    });
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
