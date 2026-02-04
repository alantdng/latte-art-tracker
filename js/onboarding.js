/**
 * Onboarding module for Latte'd app
 * Handles new user setup wizard
 */

let equipmentData = {
  machine: { brand: '', model: '' },
  grinder: { brand: '', model: '' },
  defaults: {
    milkType: '',
    milkPitcher: '',
    cupType: '',
    cupVolumeMl: ''
  }
};

/**
 * Show a specific step
 */
function showStep(stepId) {
  // Hide all steps
  document.querySelectorAll('.onboarding-step').forEach(step => {
    step.classList.remove('active');
  });

  // Show target step
  const targetStep = document.getElementById(stepId);
  if (targetStep) {
    targetStep.classList.add('active');
  }
}

/**
 * Save equipment data to profile
 */
function saveEquipmentData() {
  const profile = Storage.getProfile();

  // Add equipment data to profile
  profile.equipment = {
    machine: equipmentData.machine,
    grinder: equipmentData.grinder
  };

  // Add defaults if set
  if (equipmentData.defaults.milkType || equipmentData.defaults.milkPitcher ||
      equipmentData.defaults.cupType || equipmentData.defaults.cupVolumeMl) {
    profile.defaultParams = equipmentData.defaults;
  }

  // Mark onboarding as complete
  profile.onboardingComplete = true;

  Storage.saveProfile(profile);
}

/**
 * Initialize onboarding page
 */
async function initOnboarding() {
  // Check if user is authenticated
  try {
    await Auth.requireAuth();
  } catch (e) {
    window.location.href = 'login.html';
    return;
  }

  await Storage.initDB();

  // Check if onboarding already complete
  const profile = Storage.getProfile();
  if (profile.onboardingComplete) {
    window.location.href = 'index.html';
    return;
  }

  // Step 1: Welcome
  document.getElementById('start-setup').addEventListener('click', () => {
    showStep('step-machine');
  });

  document.getElementById('skip-all').addEventListener('click', () => {
    // Mark onboarding complete even if skipped
    const profile = Storage.getProfile();
    profile.onboardingComplete = true;
    Storage.saveProfile(profile);
    window.location.href = 'index.html';
  });

  // Step 2: Espresso Machine
  const machineBrandSelect = document.getElementById('machine-brand');
  const customMachineBrandGroup = document.getElementById('custom-machine-brand-group');

  machineBrandSelect.addEventListener('change', () => {
    if (machineBrandSelect.value === 'custom') {
      customMachineBrandGroup.classList.remove('hidden');
    } else {
      customMachineBrandGroup.classList.add('hidden');
    }
  });

  document.getElementById('machine-next').addEventListener('click', () => {
    const brand = machineBrandSelect.value === 'custom'
      ? document.getElementById('custom-machine-brand').value.trim()
      : machineBrandSelect.value;
    const model = document.getElementById('machine-model').value.trim();

    equipmentData.machine = { brand, model };
    showStep('step-grinder');
  });

  document.getElementById('machine-skip').addEventListener('click', () => {
    showStep('step-grinder');
  });

  // Step 3: Grinder
  const grinderBrandSelect = document.getElementById('grinder-brand');
  const customGrinderBrandGroup = document.getElementById('custom-grinder-brand-group');

  grinderBrandSelect.addEventListener('change', () => {
    if (grinderBrandSelect.value === 'custom') {
      customGrinderBrandGroup.classList.remove('hidden');
    } else {
      customGrinderBrandGroup.classList.add('hidden');
    }
  });

  document.getElementById('grinder-back').addEventListener('click', () => {
    showStep('step-machine');
  });

  document.getElementById('grinder-next').addEventListener('click', () => {
    const brand = grinderBrandSelect.value === 'custom'
      ? document.getElementById('custom-grinder-brand').value.trim()
      : grinderBrandSelect.value;
    const model = document.getElementById('grinder-model').value.trim();

    equipmentData.grinder = { brand, model };
    showStep('step-defaults');
  });

  document.getElementById('grinder-skip').addEventListener('click', () => {
    showStep('step-defaults');
  });

  // Step 4: Default Parameters
  document.getElementById('defaults-back').addEventListener('click', () => {
    showStep('step-grinder');
  });

  document.getElementById('defaults-finish').addEventListener('click', () => {
    equipmentData.defaults = {
      milkType: document.getElementById('default-milk').value,
      milkPitcher: document.getElementById('default-pitcher').value,
      cupType: document.getElementById('default-cup').value,
      cupVolumeMl: document.getElementById('default-cup-volume').value
    };

    saveEquipmentData();
    showStep('step-complete');
  });

  document.getElementById('defaults-skip').addEventListener('click', () => {
    saveEquipmentData();
    showStep('step-complete');
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initOnboarding);
