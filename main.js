const MODRINTH_API = "https://api.modrinth.com/v2";
const mcVersionSelect = document.getElementById('mcVersion');
const modLoaderSelect = document.getElementById('modLoader');
const modListDiv = document.getElementById('modList');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const searchBox = document.getElementById('searchBox');
const filterForm = document.getElementById('filterForm');
const categorySelect = document.getElementById('category');
const sortOrderSelect = document.getElementById('sortOrder');
const categoryTagsDiv = document.getElementById('categoryTags');
const selectedCountSpan = document.getElementById('selectedCount');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const viewButtons = document.querySelectorAll('.view-btn');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const modFileInput = document.getElementById('modFileInput');
const modFolderInput = document.getElementById('modFolderInput');
const uploadArea = document.getElementById('uploadArea');
const analyzeBtn = document.getElementById('analyzeBtn');
const updateAllBtn = document.getElementById('updateAllBtn');
const targetVersionSelect = document.getElementById('targetVersion');
const modUpdateList = document.getElementById('modUpdateList');
const updateStatusDiv = document.getElementById('updateStatus');
const detectedVersionSpan = document.getElementById('detectedVersion');
const detectedModCountSpan = document.getElementById('detectedModCount');
const identifiableModCountSpan = document.getElementById('identifiableModCount');
const commonVersionSpan = document.getElementById('commonVersion');
const analysisProgress = document.querySelector('.analysis-progress');
const analysisResults = document.querySelector('.analysis-results');
const progressFill = document.querySelector('.progress-fill');
const selectAllModsCheckbox = document.getElementById('selectAllMods');
const updateFilterButtons = document.querySelectorAll('.update-filter-btn');

let allMods = [];
let shownMods = [];
let selectedMods = new Set();
let categories = [];
let currentView = 'grid';
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let activeCategoryTags = new Set();
let isLoading = false;

// For mod updating feature
let uploadType = "folder";
let uploadedFiles = [];
let analyzedMods = [];
let detectedVersion = "";
let availableVersions = [];
let currentFilter = "all";
let selectedModsToUpdate = new Set();

// Tab switching functionality
function initTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tabId = btn.dataset.tab;
      tabContents.forEach(content => {
        if (content.id === `${tabId}-tab`) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });
}

// Function to initialize view mode
function initViewMode() {
  viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      viewButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      modListDiv.className = `mod-list ${currentView}-view`;
      renderVisibleMods();
    });
  });
}

// Initialize file upload related functionality
function initFileUpload() {
  const uploadTypeRadios = document.querySelectorAll('input[name="uploadType"]');
  uploadTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      uploadType = e.target.value;
    });
  });
  
  uploadArea.addEventListener('click', () => {
    if (uploadType === "folder") {
      modFolderInput.click();
    } else {
      modFileInput.click();
    }
  });
  
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('active');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('active');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('active');
    
    const files = e.dataTransfer.files;
    handleFiles(files);
  });
  
  modFileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });
  
  modFolderInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });
  
  // Initialize filter buttons for update tab
  updateFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      updateFilterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderModsToUpdate();
    });
  });
  
  // Handle select all checkbox
  selectAllModsCheckbox.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll('.update-mod-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllModsCheckbox.checked;
      if (selectAllModsCheckbox.checked) {
        selectedModsToUpdate.add(checkbox.value);
      } else {
        selectedModsToUpdate.delete(checkbox.value);
      }
    });
    updateAllBtn.disabled = selectedModsToUpdate.size === 0;
  });
}

// Handle uploaded files
function handleFiles(files) {
  if (!files || files.length === 0) return;
  
  // Filter only .jar files
  const jarFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.jar'));
  
  if (jarFiles.length === 0) {
    updateStatusDiv.textContent = "No jar files found. Please select Minecraft mod files.";
    updateStatusDiv.style.color = "var(--danger)";
    return;
  }
  
  uploadedFiles = jarFiles;
  updateStatusDiv.textContent = `${jarFiles.length} mod files selected.`;
  updateStatusDiv.style.color = "var(--text-primary)";
  
  // Update UI
  uploadArea.innerHTML = `<i class="fas fa-check-circle" style="color: var(--success);"></i>
                          <span>${jarFiles.length} mod files selected</span>
                          <span class="file-list">${jarFiles.length > 3 ? jarFiles.slice(0, 3).map(f => f.name).join(", ") + "..." : jarFiles.map(f => f.name).join(", ")}</span>`;
  
  analyzeBtn.disabled = false;
}

// Analyze the uploaded mod files
async function analyzeMods() {
  if (!uploadedFiles.length) return;
  
  analysisProgress.classList.remove('hidden');
  analysisResults.classList.add('hidden');
  progressFill.style.width = "0%";
  analyzeBtn.disabled = true;
  
  updateStatusDiv.textContent = "Analyzing mod files...";
  updateStatusDiv.style.color = "var(--text-primary)";
  
  analyzedMods = [];
  let mcVersionCounts = {};
  let completedCount = 0;
  
  // Process each file
  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    
    try {
      // Read JAR file and extract metadata
      const metadata = await extractModMetadata(file);
      analyzedMods.push(metadata);
      
      // Count Minecraft versions
      if (metadata.mcVersion) {
        mcVersionCounts[metadata.mcVersion] = (mcVersionCounts[metadata.mcVersion] || 0) + 1;
      }
      
      // Update progress
      completedCount++;
      const progress = (completedCount / uploadedFiles.length) * 100;
      progressFill.style.width = `${progress}%`;
      
    } catch (error) {
      console.error(`Error analyzing ${file.name}:`, error);
      analyzedMods.push({
        fileName: file.name,
        displayName: file.name.replace('.jar', ''),
        error: true
      });
      completedCount++;
      const progress = (completedCount / uploadedFiles.length) * 100;
      progressFill.style.width = `${progress}%`;
    }
  }
  
  // Find most common Minecraft version
  let mostCommonVersion = "";
  let highestCount = 0;
  for (const [version, count] of Object.entries(mcVersionCounts)) {
    if (count > highestCount) {
      highestCount = count;
      mostCommonVersion = version;
    }
  }
  
  detectedVersion = mostCommonVersion;
  
  // Update UI with results
  detectedVersionSpan.textContent = detectedVersion || "Unknown";
  detectedModCountSpan.textContent = uploadedFiles.length;
  
  const identifiableCount = analyzedMods.filter(mod => mod.modId || mod.mcVersion).length;
  identifiableModCountSpan.textContent = identifiableCount;
  
  commonVersionSpan.textContent = detectedVersion || "Unknown";
  
  // Show results and hide progress
  analysisProgress.classList.add('hidden');
  analysisResults.classList.remove('hidden');
  
  updateStatusDiv.textContent = `Analysis complete. Detected Minecraft version: ${detectedVersion || "Unknown"}`;
  
  // Load available versions for upgrading
  if (detectedVersion) {
    await loadAvailableVersions(detectedVersion);
    
    // Enable target version selection
    targetVersionSelect.disabled = false;
    
    // Fetch additional data about the mods from Modrinth
    await fetchModrinthDataForAnalyzedMods();
    
    // Render the mod update list
    renderModsToUpdate();
  } else {
    updateStatusDiv.textContent = "Could not detect Minecraft version. Please select mods for a specific Minecraft version.";
    updateStatusDiv.style.color = "var(--warning)";
  }
  
  analyzeBtn.disabled = false;
}

// Extract metadata from a mod file
function extractModMetadata(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    
    fileReader.onload = async function(e) {
      try {
        // Basic metadata from filename
        const fileName = file.name;
        let displayName = fileName.replace('.jar', '');
        let modId = null;
        let mcVersion = null;
        
        // Look for common patterns in filenames
        // Examples: sodium-mc1.19.2-0.4.1.jar, jei-1.18.2-9.7.0.196.jar
        const mcVersionRegex = /(?:mc|minecraft|forge|fabric)?-?(?<version>1\.\d+(?:\.\d+)?)/i;
        const modIdRegex = /^(?<modid>[a-z0-9_-]+)(?:-|_|\s)/i;
        
        const mcMatch = fileName.match(mcVersionRegex);
        const modMatch = fileName.match(modIdRegex);
        
        if (mcMatch && mcMatch.groups) {
          mcVersion = mcMatch.groups.version;
        }
        
        if (modMatch && modMatch.groups) {
          modId = modMatch.groups.modid.toLowerCase();
          displayName = modId.replace(/-/g, ' ').replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
        
        resolve({
          fileName,
          displayName,
          modId,
          mcVersion,
          file
        });
      } catch (error) {
        resolve({
          fileName: file.name,
          displayName: file.name.replace('.jar', ''),
          error: true
        });
      }
    };
    
    fileReader.onerror = function() {
      reject(new Error("Error reading file"));
    };
    
    // Start reading just a portion of the file to check for metadata
    // We're just reading filename metadata for now, but could analyze JAR contents if needed
    fileReader.readAsArrayBuffer(file.slice(0, 4096));
  });
}

// Load available Minecraft versions newer than the detected version
async function loadAvailableVersions(currentVersion) {
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/game_version`);
    let versions = await resp.json();
    
    // Filter stable versions newer than current
    let newerVersions = versions.filter(v => {
      // Filter out snapshots, pre-releases, etc.
      if (v.version.includes('pre') || v.version.includes('rc') || v.version.includes('w') || v.version.includes('a')) {
        return false;
      }
      
      // Compare versions (simple string comparison for now)
      return compareVersions(v.version, currentVersion) > 0;
    });
    
    // Sort versions newest first
    newerVersions.sort((a, b) => compareVersions(b.version, a.version));
    
    // Add to available versions list
    availableVersions = newerVersions.map(v => v.version);
    
    // Update target version dropdown
    targetVersionSelect.innerHTML = `<option value="">Select target version...</option>`;
    availableVersions.forEach(version => {
      const option = document.createElement('option');
      option.value = version;
      option.textContent = version;
      targetVersionSelect.appendChild(option);
    });
    
    // If there are no newer versions available
    if (availableVersions.length === 0) {
      targetVersionSelect.innerHTML = `<option value="">No newer versions available</option>`;
      targetVersionSelect.disabled = true;
    }
    
    // Add event listener for target version selection
    targetVersionSelect.addEventListener('change', async () => {
      if (targetVersionSelect.value) {
        updateStatusDiv.textContent = `Checking mod availability for Minecraft ${targetVersionSelect.value}...`;
        await checkModsForTargetVersion(targetVersionSelect.value);
      }
    });
    
  } catch (e) {
    console.error("Failed to load available versions:", e);
    targetVersionSelect.innerHTML = `<option value="">Failed to load versions</option>`;
    targetVersionSelect.disabled = true;
  }
}

// Compare two version strings
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  return 0;
}

// Fetch mod data from Modrinth for analyzed mods
async function fetchModrinthDataForAnalyzedMods() {
  updateStatusDiv.textContent = "Looking up mods on Modrinth...";
  
  for (const mod of analyzedMods) {
    if (!mod.modId || mod.error) continue;
    
    try {
      // Try to find by slug (modId)
      let response = await fetch(`${MODRINTH_API}/project/${mod.modId}`);
      
      if (!response.ok) {
        // If not found, try search
        const searchUrl = `${MODRINTH_API}/search?query=${encodeURIComponent(mod.displayName)}&limit=1&index=relevance`;
        response = await fetch(searchUrl);
        
        if (response.ok) {
          const searchResult = await response.json();
          if (searchResult.hits && searchResult.hits.length > 0) {
            mod.modrinthData = searchResult.hits[0];
          }
        }
      } else {
        mod.modrinthData = await response.json();
      }
    } catch (error) {
      console.error(`Error fetching data for ${mod.displayName}:`, error);
    }
  }
}

// Check if mods are available for target version
async function checkModsForTargetVersion(targetVersion) {
  const targetLoader = modLoaderSelect.value;
  
  for (const mod of analyzedMods) {
    if (!mod.modrinthData) continue;
    
    try {
      const versionsUrl = `${MODRINTH_API}/project/${mod.modrinthData.slug || mod.modrinthData.project_id}/version?game_versions=["${targetVersion}"]&loaders=["${targetLoader}"]`;
      const response = await fetch(versionsUrl);
      
      if (response.ok) {
        const versions = await response.json();
        mod.targetVersions = versions;
        
        if (versions.length > 0) {
          mod.hasTargetVersion = true;
          mod.targetVersion = versions[0];
        } else {
          mod.hasTargetVersion = false;
        }
      } else {
        mod.hasTargetVersion = false;
      }
    } catch (error) {
      console.error(`Error checking versions for ${mod.displayName}:`, error);
      mod.hasTargetVersion = false;
    }
  }
  
  renderModsToUpdate();
  updateAllBtn.disabled = false;
}

// Render the list of mods to update
function renderMo