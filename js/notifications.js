/**
 * Notifications module for Latte'd app
 * Handles displaying and managing user notifications
 */

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
 * Get notification icon based on type
 */
function getNotificationIcon(type) {
  switch (type) {
    case 'comment':
      return '💬';
    case 'follow':
      return '👤';
    case 'upvote':
      return '👍';
    case 'mention':
      return '@';
    default:
      return '🔔';
  }
}

/**
 * Render notification item
 */
function renderNotification(notification) {
  const icon = getNotificationIcon(notification.type);
  const timeAgo = formatRelativeTime(notification.createdAt);

  return `
    <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}">
      <div class="notification-icon">${icon}</div>
      <div class="notification-content">
        <p class="notification-message">${notification.message}</p>
        <span class="notification-time">${timeAgo}</span>
      </div>
      ${notification.link ? `<a href="${notification.link}" class="notification-link">View</a>` : ''}
    </div>
  `;
}

/**
 * Render all notifications
 */
function renderNotifications() {
  const container = document.getElementById('notifications-list');
  const emptyState = document.getElementById('notifications-empty');
  const notifications = Storage.getNotifications();

  if (notifications.length === 0) {
    container.style.display = 'none';
    emptyState.classList.remove('hidden');
    return;
  }

  container.style.display = 'flex';
  emptyState.classList.add('hidden');

  // Sort by date (newest first)
  const sortedNotifications = [...notifications].sort((a, b) => b.createdAt - a.createdAt);

  container.innerHTML = sortedNotifications.map(renderNotification).join('');

  // Add click handlers to mark as read
  container.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      Storage.markNotificationRead(id);
      item.classList.remove('unread');
    });
  });
}

/**
 * Initialize notifications page
 */
async function initNotificationsPage() {
  // Initialize storage first
  await Storage.initDB();

  renderNotifications();

  // Set up mark all as read button
  const markAllBtn = document.getElementById('mark-all-read');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', () => {
      Storage.markAllNotificationsRead();
      renderNotifications();
    });
  }

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

  // Update notification badge (header icon)
  const badge = document.getElementById('notif-badge');
  const unreadCount = Storage.getUnreadNotificationCount();
  if (badge && unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initNotificationsPage);
