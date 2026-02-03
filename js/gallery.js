/**
 * Gallery module for Latte'd app
 * Handles rendering and interactions for the gallery view
 */

/**
 * Render star rating for gallery cards
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
 * Render the gallery grid
 */
function renderGallery() {
  const container = document.getElementById('gallery-grid');
  const emptyState = document.getElementById('empty-state');
  const entries = Storage.getEntries();

  if (entries.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  container.style.display = 'grid';
  emptyState.style.display = 'none';

  const settings = Storage.getSettings();

  container.innerHTML = entries.map(entry => {
    const date = new Date(entry.createdAt);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });

    const temp = Storage.formatTemp(entry.params.milkTempF, settings);
    const isVideo = entry.media.type === 'video';

    return `
      <article class="gallery-card" data-id="${entry.id}">
        <div class="card-media">
          <img src="${entry.media.thumbnail}" alt="${entry.params.artPattern} latte art">
          ${isVideo ? '<span class="video-badge">Video</span>' : ''}
          ${entry.isPublic ? '<span class="public-badge">Public</span>' : ''}
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
          ${entry.beans ? `<div class="card-beans">${entry.beans.brand || ''} ${entry.beans.name || ''}</div>` : ''}
          <time class="card-date">${dateStr}</time>
        </div>
      </article>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      window.location.href = `detail.html?id=${id}`;
    });
  });
}

/**
 * Initialize gallery page
 */
function initGallery() {
  renderGallery();
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
window.Gallery = {
  init: initGallery,
  render: renderGallery
};
