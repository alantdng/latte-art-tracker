/**
 * Post detail page module for Latte'd app
 * Handles displaying a single feed post with comments (Reddit-style)
 */

let currentEntry = null;
let isMockEntry = false;
let documentClickHandler = null; // Track the click handler to avoid memory leaks

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

// Current sort order
let commentSortOrder = 'newest';

/**
 * Render a single comment with vote buttons, actions menu, and replies
 */
function renderComment(comment, entryId, allComments, depth = 0) {
  const profile = Storage.getProfile();
  const userVote = Storage.getCommentVote(entryId, comment.id);
  const voteScore = (comment.upvotes || 0) - (comment.downvotes || 0);
  const isOwner = comment.userId === profile.id;
  const editedTag = comment.updatedAt ? `<span class="comment-edited">(edited)</span>` : '';
  const isSaved = Storage.isCommentSaved(entryId, comment.id);
  const isReported = Storage.isCommentReported(entryId, comment.id);

  // Get replies to this comment
  const replies = allComments.filter(c => c.parentId === comment.id);
  const repliesHtml = replies.map(reply =>
    renderComment(reply, entryId, allComments, depth + 1)
  ).join('');

  const maxDepth = 4; // Max nesting level
  const indentClass = depth > 0 ? 'comment-reply' : '';
  const depthStyle = depth > 0 && depth <= maxDepth ? `margin-left: ${Math.min(depth, maxDepth) * 20}px;` : '';

  // Build three-dot menu based on ownership
  let menuContent = '';
  if (isOwner) {
    menuContent = `
      <button class="action-edit" data-comment-id="${comment.id}">Edit</button>
      <button class="action-delete" data-comment-id="${comment.id}">Delete</button>
    `;
  } else {
    menuContent = `
      <button class="action-save ${isSaved ? 'saved' : ''}" data-comment-id="${comment.id}">
        ${isSaved ? 'Unsave' : 'Save'}
      </button>
      <button class="action-report ${isReported ? 'reported' : ''}" data-comment-id="${comment.id}" ${isReported ? 'disabled' : ''}>
        ${isReported ? 'Reported' : 'Report'}
      </button>
    `;
  }

  return `
    <div class="comment-item ${indentClass}" data-comment-id="${comment.id}" style="${depthStyle}">
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
          ${editedTag}
        </div>
        <p class="comment-text" data-comment-id="${comment.id}">${escapeHtml(comment.text)}</p>
        <div class="comment-inline-actions">
          <button class="inline-action action-reply" data-comment-id="${comment.id}">Reply</button>
          <button class="inline-action action-share" data-comment-id="${comment.id}" data-entry-id="${entryId}">Share</button>
          <div class="comment-actions-wrapper">
            <button class="comment-actions-btn" data-comment-id="${comment.id}">⋮</button>
            <div class="comment-actions-menu hidden" data-comment-id="${comment.id}">
              ${menuContent}
            </div>
          </div>
        </div>
        <div class="comment-reply-form hidden" data-parent-id="${comment.id}">
          <input type="text" class="reply-input" placeholder="Write a reply..." maxlength="500">
          <div class="reply-actions">
            <button class="btn btn-small btn-secondary cancel-reply">Cancel</button>
            <button class="btn btn-small btn-primary submit-reply" data-parent-id="${comment.id}">Reply</button>
          </div>
        </div>
      </div>
    </div>
    ${repliesHtml}
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sort comments based on current sort order
 */
function sortComments(comments) {
  // Only sort top-level comments, keep replies with their parents
  const topLevel = comments.filter(c => !c.parentId);

  switch (commentSortOrder) {
    case 'oldest':
      topLevel.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case 'top':
      topLevel.sort((a, b) => {
        const scoreA = (a.upvotes || 0) - (a.downvotes || 0);
        const scoreB = (b.upvotes || 0) - (b.downvotes || 0);
        return scoreB - scoreA;
      });
      break;
    case 'controversial':
      // Controversial = most total votes (up + down)
      topLevel.sort((a, b) => {
        const totalA = (a.upvotes || 0) + (a.downvotes || 0);
        const totalB = (b.upvotes || 0) + (b.downvotes || 0);
        return totalB - totalA;
      });
      break;
    case 'newest':
    default:
      topLevel.sort((a, b) => b.createdAt - a.createdAt);
      break;
  }

  return topLevel;
}

/**
 * Render all comments
 */
function renderPostComments() {
  try {
    const container = document.getElementById('comments-thread');
    const heading = document.getElementById('comments-heading');

    if (!container || !currentEntry) return;

    let comments = [];
    if (isMockEntry) {
      comments = Storage.getMockComments(currentEntry.id);
    } else {
      comments = currentEntry.comments || [];
    }

    if (heading) {
      heading.textContent = `Comments (${comments.length})`;
    }

    if (comments.length === 0) {
      container.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
      return;
    }

    // Sort top-level comments
    const sortedTopLevel = sortComments(comments);

    // Render top-level comments with their replies
    container.innerHTML = sortedTopLevel.map(comment =>
      renderComment(comment, currentEntry.id, comments, 0)
    ).join('');

    // Add event handlers
    setupCommentEventHandlers(container);

  } catch (error) {
    console.error('Error in renderPostComments:', error);
  }
}

/**
 * Set up all comment event handlers
 */
function setupCommentEventHandlers(container) {
  // Vote handlers
  container.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      const vote = parseInt(btn.dataset.vote);
      handleVote(commentId, vote);
    });
  });

  // Actions menu toggle
  container.querySelectorAll('.comment-actions-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      const menu = container.querySelector(`.comment-actions-menu[data-comment-id="${commentId}"]`);

      // Close all other menus
      container.querySelectorAll('.comment-actions-menu').forEach(m => {
        if (m !== menu) m.classList.add('hidden');
      });

      menu.classList.toggle('hidden');
    });
  });

  // Close menus on outside click (remove old handler first to prevent memory leak)
  if (documentClickHandler) {
    document.removeEventListener('click', documentClickHandler);
  }
  documentClickHandler = () => {
    container.querySelectorAll('.comment-actions-menu').forEach(m => m.classList.add('hidden'));
  };
  document.addEventListener('click', documentClickHandler);

  // Reply buttons (now inline)
  container.querySelectorAll('.action-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      showReplyForm(commentId);
    });
  });

  // Share buttons
  container.querySelectorAll('.action-share').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      const entryId = btn.dataset.entryId;
      handleShareComment(entryId, commentId, btn);
    });
  });

  // Save buttons
  container.querySelectorAll('.action-save').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      handleSaveComment(commentId, btn);
    });
  });

  // Report buttons
  container.querySelectorAll('.action-report').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      handleReportComment(commentId, btn);
    });
  });

  // Edit buttons
  container.querySelectorAll('.action-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      showEditForm(commentId);
    });
  });

  // Delete buttons
  container.querySelectorAll('.action-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      handleDeleteComment(commentId);
    });
  });

  // Submit reply buttons
  container.querySelectorAll('.submit-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      const parentId = btn.dataset.parentId;
      const form = container.querySelector(`.comment-reply-form[data-parent-id="${parentId}"]`);
      if (!form) return;
      const input = form.querySelector('.reply-input');
      if (!input) return;
      handleReply(parentId, input.value.trim());
    });
  });

  // Cancel reply buttons
  container.querySelectorAll('.cancel-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = btn.closest('.comment-reply-form');
      form.classList.add('hidden');
      form.querySelector('.reply-input').value = '';
    });
  });

  // Reply input enter key
  container.querySelectorAll('.reply-input').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const parentId = input.closest('.comment-reply-form').dataset.parentId;
        handleReply(parentId, input.value.trim());
      }
    });
  });
}

/**
 * Show reply form for a comment
 */
function showReplyForm(commentId) {
  // Check if user is logged in
  if (!Auth.requireAuthForAction('reply to comments')) {
    return;
  }

  // Hide all reply forms first
  document.querySelectorAll('.comment-reply-form').forEach(f => f.classList.add('hidden'));
  // Hide action menus
  document.querySelectorAll('.comment-actions-menu').forEach(m => m.classList.add('hidden'));

  const form = document.querySelector(`.comment-reply-form[data-parent-id="${commentId}"]`);
  if (form) {
    form.classList.remove('hidden');
    form.querySelector('.reply-input').focus();
  }
}

/**
 * Show edit form for a comment
 */
function showEditForm(commentId) {
  // Hide action menus
  document.querySelectorAll('.comment-actions-menu').forEach(m => m.classList.add('hidden'));

  const textEl = document.querySelector(`.comment-text[data-comment-id="${commentId}"]`);
  if (!textEl) return;

  const currentText = textEl.textContent;
  const commentItem = textEl.closest('.comment-item');

  textEl.innerHTML = `
    <div class="comment-edit-form">
      <textarea class="edit-textarea">${escapeHtml(currentText)}</textarea>
      <div class="edit-actions">
        <button class="btn btn-small btn-secondary cancel-edit">Cancel</button>
        <button class="btn btn-small btn-primary save-edit" data-comment-id="${commentId}">Save</button>
      </div>
    </div>
  `;

  const textarea = textEl.querySelector('.edit-textarea');
  textarea.focus();
  textarea.selectionStart = textarea.value.length;

  // Cancel edit
  textEl.querySelector('.cancel-edit').addEventListener('click', () => {
    textEl.textContent = currentText;
  });

  // Save edit
  textEl.querySelector('.save-edit').addEventListener('click', () => {
    const newText = textarea.value.trim();
    if (newText && newText !== currentText) {
      handleEditComment(commentId, newText);
    } else {
      textEl.textContent = currentText;
    }
  });
}

/**
 * Handle reply submission
 */
function handleReply(parentId, text) {
  if (!text) return;

  // Check if user is logged in
  if (!Auth.requireAuthForAction('reply to comments')) {
    return;
  }

  if (isMockEntry) {
    Storage.addMockComment(currentEntry.id, text, parentId);
  } else {
    Storage.addComment(currentEntry.id, text, parentId);
    currentEntry = Storage.getEntry(currentEntry.id);
  }

  renderPostComments();
}

/**
 * Handle comment edit
 */
function handleEditComment(commentId, newText) {
  if (isMockEntry) {
    Storage.editMockComment(currentEntry.id, commentId, newText);
  } else {
    Storage.editComment(currentEntry.id, commentId, newText);
    currentEntry = Storage.getEntry(currentEntry.id);
  }

  renderPostComments();
}

/**
 * Handle comment deletion
 */
function handleDeleteComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;

  if (isMockEntry) {
    Storage.deleteMockComment(currentEntry.id, commentId);
  } else {
    Storage.deleteComment(currentEntry.id, commentId);
    currentEntry = Storage.getEntry(currentEntry.id);
  }

  renderPostComments();
}

/**
 * Scroll to a specific comment and highlight it
 */
function scrollToComment(commentId) {
  setTimeout(() => {
    const commentEl = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (commentEl) {
      commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      commentEl.classList.add('comment-highlight');
      setTimeout(() => {
        commentEl.classList.remove('comment-highlight');
      }, 3000);
    }
  }, 100);
}

/**
 * Handle share comment - copy URL to clipboard
 */
function handleShareComment(entryId, commentId, btn) {
  const mockParam = isMockEntry ? '&mock=true' : '';
  const url = `${window.location.origin}${window.location.pathname}?id=${entryId}${mockParam}&comment=${commentId}`;

  navigator.clipboard.writeText(url).then(() => {
    // Show feedback
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);

    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Share';
      btn.classList.remove('copied');
    }, 2000);
  });

  // Close any open menus
  document.querySelectorAll('.comment-actions-menu').forEach(m => m.classList.add('hidden'));
}

/**
 * Handle save/unsave comment
 */
function handleSaveComment(commentId, btn) {
  const entryId = currentEntry.id;
  const isSaved = Storage.isCommentSaved(entryId, commentId);

  if (isSaved) {
    Storage.unsaveComment(entryId, commentId);
    btn.textContent = 'Save';
    btn.classList.remove('saved');
  } else {
    Storage.saveCommentToList(entryId, commentId);
    btn.textContent = 'Unsave';
    btn.classList.add('saved');
  }

  // Close the menu
  document.querySelectorAll('.comment-actions-menu').forEach(m => m.classList.add('hidden'));
}

/**
 * Handle report comment
 */
function handleReportComment(commentId, btn) {
  if (btn.disabled) return;

  const reason = prompt('Why are you reporting this comment? (optional)');

  // User cancelled
  if (reason === null) return;

  Storage.reportComment(currentEntry.id, commentId, reason);

  btn.textContent = 'Reported';
  btn.classList.add('reported');
  btn.disabled = true;

  // Close the menu
  document.querySelectorAll('.comment-actions-menu').forEach(m => m.classList.add('hidden'));

  // Show confirmation
  alert('Thank you for your report. We will review this comment.');
}

/**
 * Handle vote on comment - updates vote without re-sorting
 */
function handleVote(commentId, vote) {
  // Check if user is logged in
  if (!Auth.requireAuthForAction('vote on comments')) {
    return;
  }

  if (isMockEntry) {
    Storage.voteMockComment(currentEntry.id, commentId, vote);
  } else {
    Storage.voteComment(currentEntry.id, commentId, vote);
    // Refresh entry data
    currentEntry = Storage.getEntry(currentEntry.id);
  }

  // Update just the vote display for this comment, not the whole list
  const commentItem = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
  if (commentItem) {
    const userVote = Storage.getCommentVote(currentEntry.id, commentId);

    // Get updated vote counts
    let comments = isMockEntry ? Storage.getMockComments(currentEntry.id) : (currentEntry.comments || []);
    const comment = comments.find(c => c.id === commentId);

    if (comment) {
      const voteScore = (comment.upvotes || 0) - (comment.downvotes || 0);

      // Update buttons
      const upBtn = commentItem.querySelector('.vote-btn.upvote');
      const downBtn = commentItem.querySelector('.vote-btn.downvote');
      const scoreEl = commentItem.querySelector('.vote-score');

      upBtn.classList.toggle('active', userVote === 1);
      downBtn.classList.toggle('active', userVote === -1);

      scoreEl.textContent = voteScore;
      scoreEl.className = `vote-score ${voteScore > 0 ? 'positive' : voteScore < 0 ? 'negative' : ''}`;
    }
  }
}

/**
 * Submit a new comment
 */
function submitComment() {
  // Check if user is logged in
  if (!Auth.requireAuthForAction('post comments')) {
    return;
  }

  const input = document.getElementById('comment-input');
  const text = input.value.trim();

  if (!text) return;

  // Add comment (will use "Anonymous" if no profile name set)
  if (isMockEntry) {
    Storage.addMockComment(currentEntry.id, text);
  } else {
    const result = Storage.addComment(currentEntry.id, text);
    if (!result) {
      alert('Failed to add comment. Please try again.');
      return;
    }
  }

  // Clear input
  input.value = '';

  // Refresh entry data and comments
  if (!isMockEntry) {
    const refreshedEntry = Storage.getEntry(currentEntry.id);
    if (refreshedEntry) {
      currentEntry = refreshedEntry;
    }
  }

  renderPostComments();
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
    if (!isMockEntry && !isOwnEntry) {
      const isFollowing = Storage.isFollowing(currentEntry.user.id);
      followBtn.classList.remove('hidden');
      followBtn.classList.toggle('following', isFollowing);
      followBtn.textContent = isFollowing ? 'Following' : 'Follow';

      followBtn.addEventListener('click', () => {
        // Check if user is logged in
        if (!Auth.requireAuthForAction('follow users')) {
          return;
        }

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
    renderPostComments();

    // Check if we should scroll to a specific comment
    const commentId = params.get('comment');
    if (commentId) {
      scrollToComment(commentId);
    }

    // Set up comment submission
    const commentInput = document.getElementById('comment-input');
    const submitBtn = document.getElementById('submit-comment');

    submitBtn.addEventListener('click', submitComment);
    commentInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitComment();
      }
    });

    // Set up comment sort dropdown
    const sortSelect = document.getElementById('comment-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        commentSortOrder = sortSelect.value;
        renderPostComments();
      });
    }

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

  // Update notification badge (header icon)
  const badge = document.getElementById('notif-badge');
  const unreadCount = Storage.getUnreadNotificationCount();
  if (badge && unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initPostPage);
