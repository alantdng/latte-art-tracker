/**
 * Post detail page module for Latte'd app
 * Handles displaying a single feed post with comments (Reddit-style)
 */

let currentEntry = null;
let isMockEntry = false;

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
 * Format location string
 */
function formatLocation(location) {
  if (!location) return '';
  const parts = [location.city, location.state, location.country].filter(Boolean);
  return parts.join(', ');
}

/**
 * Render star rating display
 */
function renderStars(rating) {
  if (!rating) return '';
  let html = '<span class="post-rating-stars">';
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
 * Get placeholder image for mock entries
 */
function getPlaceholderImage(entryId, pattern) {
  const PLACEHOLDER_COLORS = [
    '#8B4513', '#A0522D', '#D2691E', '#CD853F', '#DEB887',
    '#D2B48C', '#BC8F8F', '#F4A460', '#DAA520', '#B8860B'
  ];
  const colorIndex = entryId.charCodeAt(4) % PLACEHOLDER_COLORS.length;
  const color = PLACEHOLDER_COLORS[colorIndex];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect width="400" height="400" fill="${color}"/>
      <circle cx="200" cy="200" r="140" fill="#FFF5E6" opacity="0.9"/>
      <text x="200" y="210" text-anchor="middle" fill="${color}" font-family="system-ui" font-size="24" font-weight="600">${pattern}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Render a single comment with vote buttons
 */
function renderComment(comment, entryId) {
  const profile = Storage.getProfile();
  const userVote = Storage.getCommentVote(entryId, comment.id);
  const voteScore = (comment.upvotes || 0) - (comment.downvotes || 0);

  return `
    <div class="comment-item" data-comment-id="${comment.id}">
      <div class="comment-votes">
        <button class="vote-btn upvote ${userVote === 1 ? 'active' : ''}" data-vote="1" data-comment-id="${comment.id}">
          <span class="vote-arrow">▲</span>
        </button>
        <span class="vote-score ${voteScore > 0 ? 'positive' : voteScore < 0 ? 'negative' : ''}">${voteScore}</span>
        <button class="vote-btn downvote ${userVote === -1 ? 'active' : ''}" data-vote="-1" data-comment-id="${comment.id}">
          <span class="vote-arrow">▼</span>
        </button>
      </div>
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">${comment.userName}</span>
          <span class="comment-time">${formatRelativeTime(comment.createdAt)}</span>
        </div>
        <p class="comment-text">${comment.text}</p>
      </div>
    </div>
  `;
}

/**
 * Render all comments
 */
function renderComments() {
  const container = document.getElementById('comments-thread');
  const heading = document.getElementById('comments-heading');

  console.log('renderComments called, container:', !!container, 'currentEntry:', !!currentEntry);

  if (!container || !currentEntry) return;

  let comments = [];
  if (isMockEntry) {
    comments = Storage.getMockComments(currentEntry.id);
    console.log('Got mock comments:', comments);
  } else {
    comments = currentEntry.comments || [];
    console.log('Got local comments:', comments);
  }

  if (heading) {
    heading.textContent = `Comments (${comments.length})`;
  }

  if (comments.length === 0) {
    container.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
    return;
  }

  // Sort by vote score (highest first), then by date
  const sortedComments = [...comments].sort((a, b) => {
    const scoreA = (a.upvotes || 0) - (a.downvotes || 0);
    const scoreB = (b.upvotes || 0) - (b.downvotes || 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.createdAt - a.createdAt;
  });

  container.innerHTML = sortedComments.map(comment =>
    renderComment(comment, currentEntry.id)
  ).join('');

  // Add vote handlers
  container.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const commentId = btn.dataset.commentId;
      const vote = parseInt(btn.dataset.vote);
      handleVote(commentId, vote);
    });
  });
}

/**
 * Handle vote on comment
 */
function handleVote(commentId, vote) {
  if (isMockEntry) {
    Storage.voteMockComment(currentEntry.id, commentId, vote);
  } else {
    Storage.voteComment(currentEntry.id, commentId, vote);
    // Refresh entry data
    currentEntry = Storage.getEntry(currentEntry.id);
  }

  renderComments();
}

/**
 * Submit a new comment
 */
function submitComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();

  console.log('submitComment called, text:', text, 'isMockEntry:', isMockEntry, 'entryId:', currentEntry?.id);

  if (!text) return;

  // Add comment (will use "Anonymous" if no profile name set)
  if (isMockEntry) {
    const result = Storage.addMockComment(currentEntry.id, text);
    console.log('addMockComment result:', result);
  } else {
    const result = Storage.addComment(currentEntry.id, text);
    console.log('addComment result:', result);
    if (!result) {
      console.error('Failed to add comment - entry not found:', currentEntry.id);
      alert('Failed to add comment. Please try again.');
      return;
    }
  }

  // Clear input
  input.value = '';

  // Refresh entry data and comments
  if (!isMockEntry) {
    // Refresh from localStorage
    const refreshedEntry = Storage.getEntry(currentEntry.id);
    console.log('Refreshed entry:', refreshedEntry);
    if (refreshedEntry) {
      currentEntry = refreshedEntry;
    }
  }

  console.log('Calling renderComments...');
  renderComments();
}

/**
 * Initialize post page
 */
async function initPostPage() {
  try {
    await Storage.initDB();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const isMock = params.get('mock') === 'true';

    if (!id) {
      window.location.href = 'index.html';
      return;
    }

    isMockEntry = isMock;

    const feed = Storage.getCommunityFeed();
    currentEntry = feed.find(e => e.id === id);

    if (!currentEntry) {
      alert('Post not found');
      window.location.href = 'index.html';
      return;
    }

    const settings = Storage.getSettings();
    const profile = Storage.getProfile();

    // Render user info with clickable link to profile
    const avatarEl = document.getElementById('post-avatar');
    const usernameEl = document.getElementById('post-username');
    const profileUrl = `user-profile.html?id=${currentEntry.user.id}&mock=${isMockEntry}`;

    avatarEl.textContent = currentEntry.user.name.charAt(0).toUpperCase();
    avatarEl.style.cursor = 'pointer';
    avatarEl.addEventListener('click', () => window.location.href = profileUrl);

    usernameEl.textContent = currentEntry.user.name;
    usernameEl.classList.add('post-username-link');
    usernameEl.style.cursor = 'pointer';
    usernameEl.addEventListener('click', () => window.location.href = profileUrl);

    const location = formatLocation(currentEntry.user.location);
    const locationEl = document.getElementById('post-location');
    if (location) {
      locationEl.textContent = location;
    } else {
      locationEl.style.display = 'none';
    }

    // Time
    document.getElementById('post-time').textContent = formatRelativeTime(currentEntry.createdAt);

    // Follow button (only for non-mock, non-self entries)
    const followBtn = document.getElementById('follow-btn');
    const isOwnEntry = currentEntry.user.id === profile.id;
    if (!isMock && !isOwnEntry) {
      const isFollowing = Storage.isFollowing(currentEntry.user.id);
      followBtn.classList.remove('hidden');
      followBtn.classList.toggle('following', isFollowing);
      followBtn.textContent = isFollowing ? 'Following' : 'Follow';

      followBtn.addEventListener('click', () => {
        if (Storage.isFollowing(currentEntry.user.id)) {
          Storage.unfollowUser(currentEntry.user.id);
          followBtn.classList.remove('following');
          followBtn.textContent = 'Follow';
        } else {
          Storage.followUser(currentEntry.user.id);
          followBtn.classList.add('following');
          followBtn.textContent = 'Following';
        }
      });
    }

    // Media - load full resolution for local entries, thumbnail/placeholder for mock
    const mediaContainer = document.getElementById('post-media');

    if (!isMockEntry) {
      // Load full resolution media from IndexedDB for local entries
      const mediaBlob = await Storage.getMedia(currentEntry.id);
      if (mediaBlob) {
        if (currentEntry.media.type === 'video') {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(mediaBlob);
          video.controls = true;
          video.muted = true;
          mediaContainer.appendChild(video);
          const badge = document.createElement('span');
          badge.className = 'video-badge';
          badge.textContent = 'Video';
          mediaContainer.appendChild(badge);
        } else {
          const img = document.createElement('img');
          img.src = URL.createObjectURL(mediaBlob);
          img.alt = `${currentEntry.params.artPattern} latte art`;
          mediaContainer.appendChild(img);
        }
      } else {
        // Fallback to thumbnail if blob not found
        mediaContainer.innerHTML = `<img src="${currentEntry.media.thumbnail}" alt="${currentEntry.params.artPattern} latte art">`;
      }
    } else {
      // Mock entries use placeholder images
      const thumbnail = currentEntry.media.thumbnail || getPlaceholderImage(currentEntry.id, currentEntry.params.artPattern);
      if (currentEntry.media.type === 'video') {
        mediaContainer.innerHTML = `
          <video src="${thumbnail}" controls muted></video>
          <span class="video-badge">Video</span>
        `;
      } else {
        mediaContainer.innerHTML = `<img src="${thumbnail}" alt="${currentEntry.params.artPattern} latte art">`;
      }
    }

    // Pattern and rating
    document.getElementById('post-pattern').textContent = currentEntry.params.artPattern;
    if (currentEntry.rating) {
      document.getElementById('post-rating').innerHTML = renderStars(currentEntry.rating);
    }

    // Parameters
    const paramsHtml = `
      <div class="param-chip"><span class="param-label">Milk:</span> ${currentEntry.params.milkType}</div>
      <div class="param-chip"><span class="param-label">Temp:</span> ${Storage.formatTemp(currentEntry.params.milkTempF, settings)}</div>
      <div class="param-chip"><span class="param-label">Cup:</span> ${Storage.formatVolume(currentEntry.params.cupVolumeMl, settings)}</div>
      <div class="param-chip"><span class="param-label">Espresso:</span> ${Storage.formatWeight(currentEntry.params.espressoGrams, settings)}</div>
      ${currentEntry.params.milkPitcher ? `<div class="param-chip"><span class="param-label">Pitcher:</span> ${currentEntry.params.milkPitcher}</div>` : ''}
      ${currentEntry.params.spoutTip ? `<div class="param-chip"><span class="param-label">Spout:</span> ${currentEntry.params.spoutTip}</div>` : ''}
      ${currentEntry.params.cupType ? `<div class="param-chip"><span class="param-label">Cup Type:</span> ${currentEntry.params.cupType}</div>` : ''}
      ${currentEntry.params.aerationTimeSec ? `<div class="param-chip"><span class="param-label">Aeration:</span> ${currentEntry.params.aerationTimeSec}s</div>` : ''}
      ${currentEntry.params.integrationTimeSec ? `<div class="param-chip"><span class="param-label">Integration:</span> ${currentEntry.params.integrationTimeSec}s</div>` : ''}
    `;
    document.getElementById('post-params').innerHTML = paramsHtml;

    // Beans
    if (currentEntry.beans && (currentEntry.beans.brand || currentEntry.beans.name)) {
      const beansEl = document.getElementById('post-beans');
      beansEl.innerHTML = `<span class="beans-icon">☕</span> ${currentEntry.beans.brand || ''} ${currentEntry.beans.name || ''}`;
      beansEl.classList.remove('hidden');
    }

    // Notes
    if (currentEntry.notes) {
      const notesEl = document.getElementById('post-notes');
      notesEl.textContent = currentEntry.notes;
      notesEl.classList.remove('hidden');
    }

    // Render comments
    renderComments();

    // Set up comment submission
    const commentInput = document.getElementById('comment-input');
    const submitBtn = document.getElementById('submit-comment');

    submitBtn.addEventListener('click', submitComment);
    commentInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitComment();
      }
    });

    // Set up hamburger menu
    setupHamburgerMenu();
  } catch (error) {
    console.error('Error in initPostPage:', error);
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

  // Update notification badge
  const badge = document.getElementById('menu-notif-badge');
  const unreadCount = Storage.getUnreadNotificationCount();
  if (badge && unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initPostPage);
