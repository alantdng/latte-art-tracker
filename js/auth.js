console.log('auth.js loading...');
/**
 * Authentication module for Latte'd
 * Handles user registration, login, logout, and auth state
 */

// Current user state
let currentUser = null;

/**
 * Register a new user
 */
async function registerUser(email, password, username) {
  try {
    // Create auth account
    const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update display name
    await user.updateProfile({ displayName: username });

    // Create user document in Firestore
    await firebaseDb.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: email,
      username: username,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      profile: {
        name: username,
        location: {
          city: '',
          state: '',
          country: ''
        }
      },
      settings: {
        tempUnit: 'F',
        volumeUnit: 'ml',
        weightUnit: 'g'
      },
      following: [],
      loadouts: []
    });

    return { success: true, user };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Login user
 */
async function loginUser(email, password) {
  try {
    const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);

    // Trigger cloud sync after login (in background)
    if (window.Storage && window.Storage.performFullSync) {
      console.log('Starting cloud sync after login...');
      window.Storage.performFullSync().catch(err => {
        console.error('Post-login sync error:', err);
      });
    }

    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Logout user
 */
async function logoutUser() {
  try {
    await firebaseAuth.signOut();
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current user
 */
function getCurrentUser() {
  return currentUser;
}

/**
 * Check if user is logged in
 */
function isLoggedIn() {
  return currentUser !== null;
}

/**
 * Get user data from Firestore
 */
async function getUserData() {
  if (!currentUser) return null;

  try {
    const doc = await firebaseDb.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

/**
 * Update user profile
 */
async function updateUserProfile(profileData) {
  if (!currentUser) return { success: false, error: 'Not logged in' };

  try {
    await firebaseDb.collection('users').doc(currentUser.uid).update({
      profile: profileData
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating profile:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update user settings
 */
async function updateUserSettings(settings) {
  if (!currentUser) return { success: false, error: 'Not logged in' };

  try {
    await firebaseDb.collection('users').doc(currentUser.uid).update({
      settings: settings
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating settings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize auth state listener
 */
function initAuthStateListener(callback) {
  firebaseAuth.onAuthStateChanged((user) => {
    currentUser = user;
    if (callback) callback(user);
  });
}

/**
 * Require authentication - redirect to login if not logged in
 */
function requireAuth() {
  return new Promise((resolve) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
      unsubscribe();
      if (!user) {
        window.location.href = 'login.html';
      } else {
        currentUser = user;

        // Trigger cloud sync in background (only once per session)
        const syncKey = 'latte_last_sync_session';
        const lastSync = sessionStorage.getItem(syncKey);
        if (!lastSync && window.Storage && window.Storage.performFullSync) {
          sessionStorage.setItem(syncKey, Date.now().toString());
          console.log('Starting cloud sync on page load...');
          window.Storage.performFullSync().catch(err => {
            console.error('Page load sync error:', err);
          });
        }

        resolve(user);
      }
    });
  });
}

/**
 * Optional auth - allows guest browsing but tracks auth state
 * Returns user if logged in, null if guest
 */
function optionalAuth() {
  return new Promise((resolve) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
      unsubscribe();
      currentUser = user;

      // Trigger cloud sync if logged in
      if (user) {
        const syncKey = 'latte_last_sync_session';
        const lastSync = sessionStorage.getItem(syncKey);
        if (!lastSync && window.Storage && window.Storage.performFullSync) {
          sessionStorage.setItem(syncKey, Date.now().toString());
          window.Storage.performFullSync().catch(err => {
            console.error('Page load sync error:', err);
          });
        }
      }

      resolve(user); // Returns null for guests, user object if logged in
    });
  });
}

/**
 * Check if action requires auth and show login prompt if needed
 * Returns true if user is logged in, false if guest (and shows prompt)
 */
function requireAuthForAction(actionName = 'do this') {
  if (currentUser) {
    return true;
  }

  // Show login prompt modal
  showLoginPrompt(actionName);
  return false;
}

/**
 * Show login prompt modal for guests
 */
function showLoginPrompt(actionName = 'do this') {
  // Check if modal already exists
  let modal = document.getElementById('login-prompt-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'login-prompt-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-dialog login-prompt-dialog">
        <div class="login-prompt-icon">☕</div>
        <h2>Join the Community!</h2>
        <p class="login-prompt-message">Create an account to <span id="login-prompt-action">${actionName}</span> and connect with other latte art enthusiasts.</p>
        <div class="login-prompt-actions">
          <a href="register.html" class="btn btn-primary btn-large">Sign Up Free</a>
          <a href="login.html" class="btn btn-secondary">Already have an account? Log In</a>
        </div>
        <button class="btn-close-modal" id="close-login-prompt">&times;</button>
      </div>
    `;
    document.body.appendChild(modal);

    // Close button handler
    document.getElementById('close-login-prompt').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  } else {
    // Update the action text
    document.getElementById('login-prompt-action').textContent = actionName;
  }

  modal.classList.remove('hidden');
}

/**
 * Redirect if already logged in (for login/register pages)
 */
function redirectIfLoggedIn() {
  return new Promise((resolve) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
      unsubscribe();
      if (user) {
        window.location.href = 'index.html';
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send password reset email
 */
async function sendPasswordReset(email) {
  try {
    await firebaseAuth.sendPasswordResetEmail(email);
    return { success: true };
  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, error: error.message };
  }
}

// Export
window.Auth = {
  register: registerUser,
  login: loginUser,
  logout: logoutUser,
  getCurrentUser,
  isLoggedIn,
  getUserData,
  updateUserProfile,
  updateUserSettings,
  initAuthStateListener,
  requireAuth,
  optionalAuth,
  requireAuthForAction,
  showLoginPrompt,
  redirectIfLoggedIn,
  sendPasswordReset
};
