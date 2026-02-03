/**
 * Entry form module for Latte'd app
 * Handles form rendering, validation, and submission
 */

const MILK_TYPES = ['Whole', '2%', 'Skim', 'Oat', 'Almond', 'Soy', 'Coconut'];
const PITCHER_SIZES = ['12oz', '17oz', '20oz', '32oz'];
const CUP_TYPES = ['Ceramic mug', 'Glass cup', 'Paper cup', 'Latte bowl', 'Cappuccino cup'];
const ART_PATTERNS = ['Heart', 'Tulip', 'Rosetta', 'Swan', 'Latte bear', 'Winged tulip', 'Blank'];
// SPOUT_TIPS is defined in storage.js - use Storage.SPOUT_TIPS if needed

// Popular coffee bean brands
const BEAN_BRANDS = [
  'Stumptown', 'Blue Bottle', 'Intelligentsia', 'Counter Culture',
  'Onyx', 'Verve', 'La Colombe', 'Equator', 'Ritual', 'Sightglass'
];

let currentMedia = null;
let currentMediaType = null;
let editingId = null;
let currentRating = 0;
let editingLoadoutId = null;

/**
 * Set up dropdown with custom input toggle
 */
function setupDropdown(id) {
  const select = document.getElementById(id);
  const customInput = document.getElementById(`${id}-custom`);

  if (!select || !customInput) return;

  select.addEventListener('change', () => {
    if (select.value === '__custom__') {
      customInput.classList.remove('hidden');
      customInput.required = select.required;
      customInput.focus();
    } else {
      customInput.classList.add('hidden');
      customInput.required = false;
      customInput.value = '';
    }
  });
}

/**
 * Get value from dropdown (including custom)
 */
function getDropdownValue(id) {
  const select = document.getElementById(id);
  const customInput = document.getElementById(`${id}-custom`);

  if (!select) return '';

  if (select.value === '__custom__' && customInput) {
    return customInput.value.trim();
  }
  return select.value;
}

/**
 * Set dropdown value (handles custom values)
 */
function setDropdownValue(id, value, options) {
  const select = document.getElementById(id);
  const customInput = document.getElementById(`${id}-custom`);

  if (!select) return;

  if (options.includes(value)) {
    select.value = value;
  } else if (value) {
    select.value = '__custom__';
    if (customInput) {
      customInput.classList.remove('hidden');
      customInput.value = value;
    }
  }
}

/**
 * Handle media file selection
 */
async function handleMediaSelect(file) {
  console.log('handleMediaSelect called with file:', file);
  const preview = document.getElementById('media-preview');
  const placeholder = document.getElementById('upload-placeholder');
  const error = document.getElementById('media-error');

  error.textContent = '';
  error.classList.add('hidden');

  // Validate file type
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    error.textContent = 'Please select an image or video file.';
    error.classList.remove('hidden');
    return;
  }

  // Check video duration
  if (file.type.startsWith('video/')) {
    const duration = await getVideoDuration(file);
    if (duration > 30) {
      error.textContent = 'Video must be 30 seconds or less.';
      error.classList.remove('hidden');
      return;
    }
  }

  currentMedia = file;
  currentMediaType = file.type.startsWith('image/') ? 'image' : 'video';

  // Show preview
  placeholder.classList.add('hidden');
  preview.innerHTML = '';

  if (currentMediaType === 'image') {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = 'Preview';
    preview.appendChild(img);
  } else {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.muted = true;
    preview.appendChild(video);
  }

  preview.classList.remove('hidden');

  // Add remove button
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-media';
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = clearMedia;
  preview.appendChild(removeBtn);
}

/**
 * Get video duration
 */
function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Clear media selection
 */
function clearMedia() {
  currentMedia = null;
  currentMediaType = null;

  const preview = document.getElementById('media-preview');
  const placeholder = document.getElementById('upload-placeholder');

  preview.innerHTML = '';
  preview.classList.add('hidden');
  placeholder.classList.remove('hidden');
}

/**
 * Set up star rating input
 */
function setupRatingInput() {
  const container = document.querySelector('.star-rating-interactive');
  const display = document.getElementById('rating-display');
  const input = document.getElementById('rating');

  if (!container) return;

  const stars = container.querySelectorAll('.star-btn');

  stars.forEach((star, index) => {
    const value = parseFloat(star.dataset.value);

    // Hover effect
    star.addEventListener('mouseenter', () => {
      updateStarDisplay(value, stars);
    });

    // Click to set rating
    star.addEventListener('click', () => {
      currentRating = value;
      input.value = value;
      updateStarDisplay(value, stars);
      display.textContent = `${value} / 5`;
    });
  });

  // Reset on mouse leave
  container.addEventListener('mouseleave', () => {
    updateStarDisplay(currentRating, stars);
  });
}

/**
 * Update star display based on value
 */
function updateStarDisplay(value, stars) {
  stars.forEach((star) => {
    const starValue = parseFloat(star.dataset.value);
    if (starValue <= value) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

/**
 * Set rating value programmatically
 */
function setRating(value) {
  currentRating = value;
  const input = document.getElementById('rating');
  const display = document.getElementById('rating-display');
  const stars = document.querySelectorAll('.star-rating-interactive .star-btn');

  if (input) input.value = value;
  if (display) display.textContent = value ? `${value} / 5` : 'No rating';
  if (stars.length) updateStarDisplay(value, stars);
}

/**
 * Validate the form
 */
function validateForm() {
  const errors = [];

  if (!currentMedia && !editingId) {
    errors.push('Please select a photo or video.');
  }

  if (!getDropdownValue('milkType')) {
    errors.push('Milk type is required.');
  }

  if (!getDropdownValue('artPattern')) {
    errors.push('Art pattern is required.');
  }

  const cupVolume = document.getElementById('cupVolume').value;
  if (!cupVolume || cupVolume <= 0) {
    errors.push('Cup volume must be a positive number.');
  }

  const espresso = document.getElementById('espressoGrams').value;
  if (!espresso || espresso <= 0) {
    errors.push('Espresso weight must be a positive number.');
  }

  const milkTemp = document.getElementById('milkTemp').value;
  if (!milkTemp || milkTemp <= 0) {
    errors.push('Milk temperature is required.');
  }

  return errors;
}

/**
 * Get form data
 */
function getFormData() {
  const settings = Storage.getSettings();

  // Get raw values
  let milkTemp = parseFloat(document.getElementById('milkTemp').value);
  let cupVolume = parseFloat(document.getElementById('cupVolume').value);
  let espressoGrams = parseFloat(document.getElementById('espressoGrams').value);

  // Convert to storage units (metric) if user is in imperial mode
  if (settings.tempUnit === 'C') {
    milkTemp = Storage.convertTemp(milkTemp, 'C', 'F');
  }
  if (settings.volumeUnit === 'oz') {
    cupVolume = Storage.convertVolume(cupVolume, 'oz', 'ml');
  }
  if (settings.weightUnit === 'oz') {
    espressoGrams = Storage.convertWeight(espressoGrams, 'oz', 'g');
  }

  // Get bean info
  const beanBrand = getDropdownValue('beanBrand');
  const beanName = document.getElementById('beanName').value.trim();
  const beans = (beanBrand || beanName) ? { brand: beanBrand, name: beanName } : null;

  // Get spout tip
  const spoutTip = document.getElementById('spoutTip')?.value || '';

  return {
    media: {
      type: currentMediaType
    },
    params: {
      milkType: getDropdownValue('milkType'),
      milkPitcher: getDropdownValue('milkPitcher'),
      spoutTip: spoutTip,
      cupType: getDropdownValue('cupType'),
      cupVolumeMl: cupVolume,
      espressoGrams: espressoGrams,
      milkTempF: milkTemp,
      artPattern: getDropdownValue('artPattern'),
      aerationTimeSec: parseFloat(document.getElementById('aerationTime').value) || 0,
      integrationTimeSec: parseFloat(document.getElementById('integrationTime').value) || 0
    },
    beans,
    rating: currentRating,
    notes: document.getElementById('notes').value.trim(),
    isPublic: document.getElementById('isPublic')?.checked || false
  };
}

/**
 * Handle form submission
 */
async function handleSubmit(e) {
  e.preventDefault();

  const errors = validateForm();
  const errorContainer = document.getElementById('form-errors');

  if (errors.length > 0) {
    errorContainer.innerHTML = errors.map(err => `<p>${err}</p>`).join('');
    errorContainer.classList.remove('hidden');
    errorContainer.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  errorContainer.classList.add('hidden');

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const formData = getFormData();

    if (editingId) {
      await Storage.updateEntry(editingId, formData, currentMedia);
    } else {
      await Storage.createEntry(formData, currentMedia);
    }

    window.location.href = 'my-lattes.html';
  } catch (err) {
    console.error('Error saving entry:', err);
    errorContainer.innerHTML = `<p>Failed to save entry: ${err.message}</p>`;
    errorContainer.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Entry';
  }
}

/**
 * Load entry for editing
 */
async function loadEntryForEdit(id) {
  const entry = Storage.getEntry(id);
  if (!entry) {
    alert('Entry not found');
    window.location.href = 'my-lattes.html';
    return;
  }

  editingId = id;
  document.querySelector('h1').textContent = 'Edit Entry';
  document.getElementById('submit-btn').textContent = 'Update Entry';

  const settings = Storage.getSettings();

  // Load media preview
  const mediaBlob = await Storage.getMedia(id);
  if (mediaBlob) {
    currentMedia = mediaBlob;
    currentMediaType = entry.media.type;

    const preview = document.getElementById('media-preview');
    const placeholder = document.getElementById('upload-placeholder');

    placeholder.classList.add('hidden');
    preview.innerHTML = '';

    if (currentMediaType === 'image') {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(mediaBlob);
      img.alt = 'Preview';
      preview.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(mediaBlob);
      video.controls = true;
      video.muted = true;
      preview.appendChild(video);
    }

    preview.classList.remove('hidden');

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-media';
    removeBtn.textContent = 'Change';
    removeBtn.onclick = clearMedia;
    preview.appendChild(removeBtn);
  }

  // Load form values
  setDropdownValue('milkType', entry.params.milkType, MILK_TYPES);
  setDropdownValue('milkPitcher', entry.params.milkPitcher, PITCHER_SIZES);
  setDropdownValue('cupType', entry.params.cupType, CUP_TYPES);
  setDropdownValue('artPattern', entry.params.artPattern, ART_PATTERNS);

  // Spout tip
  const spoutTipSelect = document.getElementById('spoutTip');
  if (spoutTipSelect && entry.params.spoutTip) {
    spoutTipSelect.value = entry.params.spoutTip;
  }

  // Convert values to user's preferred units
  let cupVolume = entry.params.cupVolumeMl;
  let espressoWeight = entry.params.espressoGrams;
  let tempValue = entry.params.milkTempF;

  if (settings.volumeUnit === 'oz') {
    cupVolume = Storage.convertVolume(cupVolume, 'ml', 'oz');
  }
  if (settings.weightUnit === 'oz') {
    espressoWeight = Storage.convertWeight(espressoWeight, 'g', 'oz');
  }
  if (settings.tempUnit === 'C') {
    tempValue = Storage.convertTemp(tempValue, 'F', 'C');
  }

  document.getElementById('cupVolume').value = cupVolume;
  document.getElementById('espressoGrams').value = espressoWeight;
  document.getElementById('milkTemp').value = tempValue;

  document.getElementById('aerationTime').value = entry.params.aerationTimeSec || '';
  document.getElementById('integrationTime').value = entry.params.integrationTimeSec || '';
  document.getElementById('notes').value = entry.notes || '';

  // Load bean info
  if (entry.beans) {
    setDropdownValue('beanBrand', entry.beans.brand, BEAN_BRANDS);
    document.getElementById('beanName').value = entry.beans.name || '';
  }

  // Load rating
  if (entry.rating) {
    setRating(entry.rating);
  }

  // Load public setting
  if (document.getElementById('isPublic')) {
    document.getElementById('isPublic').checked = entry.isPublic || false;
  }
}

// ==========================================
// Loadout Functions
// ==========================================

/**
 * Populate loadout dropdown
 */
function populateLoadoutDropdown() {
  const select = document.getElementById('loadout-select');
  if (!select) return;

  const loadouts = Storage.getLoadouts();
  const activeId = Storage.getActiveLoadoutId();

  // Clear existing options except the first one
  select.innerHTML = '<option value="">No loadout (start fresh)</option>';

  loadouts.forEach(loadout => {
    const option = document.createElement('option');
    option.value = loadout.id;
    option.textContent = loadout.name;
    if (loadout.id === activeId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

/**
 * Apply loadout values to form
 */
function applyLoadout(loadoutId) {
  if (!loadoutId) {
    Storage.setActiveLoadoutId(null);
    return;
  }

  const loadout = Storage.getLoadout(loadoutId);
  if (!loadout) return;

  Storage.setActiveLoadoutId(loadoutId);
  const settings = Storage.getSettings();

  // Apply milk parameters
  setDropdownValue('milkType', loadout.params.milkType, MILK_TYPES);
  setDropdownValue('milkPitcher', loadout.params.milkPitcher, PITCHER_SIZES);
  setDropdownValue('cupType', loadout.params.cupType, CUP_TYPES);

  // Spout tip
  const spoutTipSelect = document.getElementById('spoutTip');
  if (spoutTipSelect && loadout.params.spoutTip) {
    spoutTipSelect.value = loadout.params.spoutTip;
  }

  // Numeric values - convert from storage units if needed
  if (loadout.params.cupVolumeMl) {
    let cupVolume = loadout.params.cupVolumeMl;
    if (settings.volumeUnit === 'oz') {
      cupVolume = Storage.convertVolume(cupVolume, 'ml', 'oz');
    }
    document.getElementById('cupVolume').value = cupVolume;
  }

  if (loadout.params.espressoGrams) {
    let espresso = loadout.params.espressoGrams;
    if (settings.weightUnit === 'oz') {
      espresso = Storage.convertWeight(espresso, 'g', 'oz');
    }
    document.getElementById('espressoGrams').value = espresso;
  }

  if (loadout.params.milkTempF) {
    let temp = loadout.params.milkTempF;
    if (settings.tempUnit === 'C') {
      temp = Storage.convertTemp(temp, 'F', 'C');
    }
    document.getElementById('milkTemp').value = temp;
  }

  if (loadout.params.aerationTimeSec) {
    document.getElementById('aerationTime').value = loadout.params.aerationTimeSec;
  }

  if (loadout.params.integrationTimeSec) {
    document.getElementById('integrationTime').value = loadout.params.integrationTimeSec;
  }

  // Beans
  if (loadout.beans) {
    setDropdownValue('beanBrand', loadout.beans.brand, BEAN_BRANDS);
    document.getElementById('beanName').value = loadout.beans.name || '';
  }
}

/**
 * Get current form values for saving as loadout
 */
function getLoadoutParams() {
  const settings = Storage.getSettings();

  // Get raw values and convert to storage units
  let cupVolume = parseFloat(document.getElementById('cupVolume').value) || '';
  let espresso = parseFloat(document.getElementById('espressoGrams').value) || '';
  let temp = parseFloat(document.getElementById('milkTemp').value) || '';

  if (cupVolume && settings.volumeUnit === 'oz') {
    cupVolume = Storage.convertVolume(cupVolume, 'oz', 'ml');
  }
  if (espresso && settings.weightUnit === 'oz') {
    espresso = Storage.convertWeight(espresso, 'oz', 'g');
  }
  if (temp && settings.tempUnit === 'C') {
    temp = Storage.convertTemp(temp, 'C', 'F');
  }

  const beanBrand = getDropdownValue('beanBrand');
  const beanName = document.getElementById('beanName').value.trim();

  return {
    milkType: getDropdownValue('milkType'),
    milkPitcher: getDropdownValue('milkPitcher'),
    spoutTip: document.getElementById('spoutTip')?.value || '',
    cupType: getDropdownValue('cupType'),
    cupVolumeMl: cupVolume,
    espressoGrams: espresso,
    milkTempF: temp,
    aerationTimeSec: parseFloat(document.getElementById('aerationTime').value) || '',
    integrationTimeSec: parseFloat(document.getElementById('integrationTime').value) || '',
    beans: (beanBrand || beanName) ? { brand: beanBrand, name: beanName } : null
  };
}

/**
 * Open save loadout modal
 */
function openSaveLoadoutModal(editId = null) {
  const modal = document.getElementById('save-loadout-modal');
  const nameInput = document.getElementById('loadout-name');
  const title = document.getElementById('save-loadout-title');

  editingLoadoutId = editId;

  if (editId) {
    const loadout = Storage.getLoadout(editId);
    title.textContent = 'Edit Loadout';
    nameInput.value = loadout ? loadout.name : '';
  } else {
    title.textContent = 'Save Loadout';
    nameInput.value = '';
  }

  modal.classList.remove('hidden');
  nameInput.focus();
}

/**
 * Close save loadout modal
 */
function closeSaveLoadoutModal() {
  document.getElementById('save-loadout-modal').classList.add('hidden');
  editingLoadoutId = null;
}

/**
 * Save or update loadout
 */
function saveLoadout() {
  const nameInput = document.getElementById('loadout-name');
  const name = nameInput.value.trim();

  if (!name) {
    alert('Please enter a name for your loadout.');
    return;
  }

  const params = getLoadoutParams();

  if (editingLoadoutId) {
    Storage.updateLoadout(editingLoadoutId, name, params);
  } else {
    const loadout = Storage.createLoadout(name, params);
    Storage.setActiveLoadoutId(loadout.id);
  }

  closeSaveLoadoutModal();
  populateLoadoutDropdown();
  renderLoadoutList();
}

/**
 * Open manage loadouts modal
 */
function openManageLoadoutsModal() {
  const modal = document.getElementById('loadout-modal');
  renderLoadoutList();
  modal.classList.remove('hidden');
}

/**
 * Close manage loadouts modal
 */
function closeManageLoadoutsModal() {
  document.getElementById('loadout-modal').classList.add('hidden');
}

/**
 * Render loadout list in manage modal
 */
function renderLoadoutList() {
  const container = document.getElementById('loadout-list');
  const emptyMessage = document.getElementById('no-loadouts');
  const loadouts = Storage.getLoadouts();
  const activeId = Storage.getActiveLoadoutId();

  if (loadouts.length === 0) {
    container.innerHTML = '';
    emptyMessage.classList.remove('hidden');
    return;
  }

  emptyMessage.classList.add('hidden');

  container.innerHTML = loadouts.map(loadout => `
    <div class="loadout-item ${loadout.id === activeId ? 'active' : ''}" data-id="${loadout.id}">
      <div class="loadout-item-info">
        <span class="loadout-item-name">${loadout.name}</span>
        <span class="loadout-item-details">
          ${loadout.params.milkType || 'Any milk'} ·
          ${loadout.params.cupType || 'Any cup'} ·
          ${loadout.beans?.brand || 'Any beans'}
        </span>
      </div>
      <div class="loadout-item-actions">
        <button type="button" class="btn-icon btn-edit-loadout" data-id="${loadout.id}" title="Edit">✎</button>
        <button type="button" class="btn-icon btn-delete-loadout" data-id="${loadout.id}" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.btn-edit-loadout').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeManageLoadoutsModal();
      openSaveLoadoutModal(btn.dataset.id);
    });
  });

  container.querySelectorAll('.btn-delete-loadout').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete this loadout?')) {
        Storage.deleteLoadout(btn.dataset.id);
        populateLoadoutDropdown();
        renderLoadoutList();
      }
    });
  });

  // Click on loadout item to select it
  container.querySelectorAll('.loadout-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      applyLoadout(id);
      populateLoadoutDropdown();
      closeManageLoadoutsModal();
    });
  });
}

/**
 * Set up loadout event handlers
 */
function setupLoadoutHandlers() {
  // Loadout dropdown change
  const loadoutSelect = document.getElementById('loadout-select');
  if (loadoutSelect) {
    loadoutSelect.addEventListener('change', () => {
      applyLoadout(loadoutSelect.value);
    });
  }

  // Save loadout button
  const saveBtn = document.getElementById('save-loadout-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => openSaveLoadoutModal());
  }

  // Manage loadouts button
  const manageBtn = document.getElementById('manage-loadouts-btn');
  if (manageBtn) {
    manageBtn.addEventListener('click', openManageLoadoutsModal);
  }

  // Close modals
  document.getElementById('close-loadout-modal')?.addEventListener('click', closeManageLoadoutsModal);
  document.getElementById('close-save-modal')?.addEventListener('click', closeSaveLoadoutModal);
  document.getElementById('cancel-save-loadout')?.addEventListener('click', closeSaveLoadoutModal);
  document.getElementById('confirm-save-loadout')?.addEventListener('click', saveLoadout);

  // Close modal on outside click
  document.getElementById('loadout-modal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeManageLoadoutsModal();
    }
  });

  document.getElementById('save-loadout-modal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeSaveLoadoutModal();
    }
  });

  // Enter key to save loadout
  document.getElementById('loadout-name')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveLoadout();
    }
  });
}

/**
 * Update unit labels based on settings
 */
function updateUnitLabels() {
  const settings = Storage.getSettings();

  const tempUnit = document.getElementById('temp-unit');
  if (tempUnit) tempUnit.textContent = `°${settings.tempUnit}`;

  const volumeUnit = document.getElementById('volume-unit');
  if (volumeUnit) volumeUnit.textContent = settings.volumeUnit;

  const weightUnit = document.getElementById('weight-unit');
  if (weightUnit) weightUnit.textContent = settings.weightUnit;
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

/**
 * Initialize entry form
 */
function initEntryForm() {
  // Set up hamburger menu
  setupHamburgerMenu();

  // Set up dropdowns
  ['milkType', 'milkPitcher', 'cupType', 'artPattern', 'beanBrand'].forEach(setupDropdown);

  // Update unit labels
  updateUnitLabels();

  // Set up loadouts
  populateLoadoutDropdown();
  setupLoadoutHandlers();

  // Apply active loadout if one is set (only for new entries)
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (!editId) {
    const activeLoadout = Storage.getActiveLoadout();
    if (activeLoadout) {
      applyLoadout(activeLoadout.id);
    }
  }

  // Set up rating input
  setupRatingInput();

  // Set up media upload
  const dropZone = document.getElementById('media-drop-zone');
  const fileInput = document.getElementById('media-input');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleMediaSelect(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleMediaSelect(file);
  });

  // Set up form submission
  document.getElementById('entry-form').addEventListener('submit', handleSubmit);

  // Check if editing
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    loadEntryForEdit(editId);
  }
}

// Export
window.EntryForm = {
  init: initEntryForm,
  MILK_TYPES,
  PITCHER_SIZES,
  CUP_TYPES,
  ART_PATTERNS,
  SPOUT_TIPS: Storage.SPOUT_TIPS,
  BEAN_BRANDS
};

