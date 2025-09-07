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
let analyzedModFiles = []; // Store analyzed mod files for updating

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

// Fetch Minecraft versions
async function fetchVersions() {
  statusDiv.textContent = "Loading Minecraft versions...";
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/game_version`);
    let versions = await resp.json();
    let stable = versions.filter(v => !v.version.endsWith("-rc"))
      .map(v => v.version);
    stable = Array.from(new Set(stable));
    stable.sort((a,b) => b.localeCompare(a, undefined, {numeric:true, sensitivity:'base'}));
    mcVersionSelect.innerHTML = "";
    stable.forEach(v => {
      let opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      mcVersionSelect.appendChild(opt);
    });
    mcVersionSelect.value = stable.find(v => v === "1.20.1") || stable[0];
    statusDiv.textContent = "";
  } catch (e) {
    mcVersionSelect.innerHTML = "<option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
    statusDiv.textContent = "Failed to load versions.";
  }
}

// Fetch categories
async function fetchCategories() {
  try {
    let resp = await fetch(`${MODRINTH_API}/tag/category`);
    let cats = await resp.json();
    categories = cats.filter(cat =>
      ['technology','magic','storage','food','economy','adventure','equipment','library','misc','optimization','social','utility','worldgen'].includes(cat.name) ||
      cat.project_type === 'mod'
    );
    
    // Populate category dropdown
    categorySelect.innerHTML = "<option value=''>All</option>";
    categories.forEach(cat => {
      let opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
      categorySelect.appendChild(opt);
    });
    
    // Create category tags
    renderCategoryTags();
  } catch (e) {
    categorySelect.innerHTML = "<option value=''>All</option>";
  }
}

// Render category tags
function renderCategoryTags() {
  categoryTagsDiv.innerHTML = "";
  if (!categories.length) return;
  
  // Add "All" tag
  const allTag = document.createElement("span");
  allTag.className = "category-tag";
  if (activeCategoryTags.size === 0) allTag.classList.add("active");
  allTag.textContent = "All";
  allTag.addEventListener("click", () => {
    activeCategoryTags.clear();
    categorySelect.value = "";
    renderCategoryTags();
    reloadMods();
  });
  categoryTagsDiv.appendChild(allTag);
  
  // Add category tags
  categories.forEach(cat => {
    if (!['technology','magic','storage','food','adventure','equipment','library','optimization','utility','worldgen'].includes(cat.name)) {
      return;
    }
    
    const tagSpan = document.createElement("span");
    tagSpan.className = "category-tag";
    if (activeCategoryTags.has(cat.name)) tagSpan.classList.add("active");
    tagSpan.textContent = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
    tagSpan.addEventListener("click", () => {
      if (activeCategoryTags.has(cat.name)) {
        activeCategoryTags.delete(cat.name);
      } else {
        activeCategoryTags.add(cat.name);
      }
      categorySelect.value = activeCategoryTags.size === 1 ? [...activeCategoryTags][0] : "";
      renderCategoryTags();
      reloadMods();
    });
    categoryTagsDiv.appendChild(tagSpan);
  });
}

// Fetch mods with pagination
async function fetchMods(version, loader, query = "", category = "", sortOrder = "relevance", page = 1) {
  statusDiv.textContent = "Loading mods...";
  loadMoreBtn.disabled = true;
  loadMoreBtn.classList.add('loading');
  isLoading = true;
  
  try {
    let offset = (page - 1) * pageSize;
    let limit = pageSize;
    
    let facetsArr = [
      ["project_type:mod"],
      [`versions:${version}`],
      [`categories:${loader}`],
    ];
    
    // Handle multiple categories
    if (activeCategoryTags.size > 0) {
      activeCategoryTags.forEach(cat => {
        facetsArr.push([`categories:${cat}`]);
      });
    } else if (category) {
      facetsArr.push([`categories:${category}`]);
    }
    
    let facets = encodeURIComponent(JSON.stringify(facetsArr));
    let url = `${MODRINTH_API}/search?limit=${limit}&offset=${offset}&facets=${facets}&index=${sortOrder}`;
    if (query) url += `&query=${encodeURIComponent(query)}`;
    
    let resp = await fetch(url);
    let json = await resp.json();
    
    // Calculate total pages
    totalPages = Math.ceil(json.total_hits / pageSize);
    
    // Update load more button visibility
    loadMoreBtn.style.display = page >= totalPages ? 'none' : 'block';
    
    return json.hits;
  } catch (e) {
    statusDiv.textContent = "Failed to fetch mods: " + e;
    return [];
  } finally {
    loadMoreBtn.disabled = false;
    loadMoreBtn.classList.remove('loading');
    isLoading = false;
  }
}

// Render mods with the current view
function renderVisibleMods() {
  modListDiv.innerHTML = "";
  modListDiv.className = `mod-list ${currentView}-view`;
  
  if (!shownMods.length) {
    modListDiv.innerHTML = "<p class='empty-state'>No mods found for this version/loader/category.</p>";
    downloadBtn.disabled = true;
    return;
  }
  
  shownMods.forEach((mod, idx) => {
    let div = document.createElement("div");
    div.className = "mod-item";
    div.style.animationDelay = (idx * 0.03) + "s";
    
    // Checkbox
    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "mod-checkbox";
    checkbox.checked = selectedMods.has(mod.slug);
    checkbox.value = mod.slug;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedMods.add(mod.slug);
      else selectedMods.delete(mod.slug);
      downloadBtn.disabled = selectedMods.size === 0;
      selectedCountSpan.textContent = selectedMods.size;
    });
    div.appendChild(checkbox);

    // Don't show thumb in small views
    if (!currentView.includes('small')) {
      if (currentView === 'grid') {
        let thumbContainer = document.createElement("div");
        thumbContainer.className = "mod-thumb-container";
        
        let thumb = document.createElement("img");
        thumb.className = "mod-thumb";
        thumb.src = mod.icon_url || "https://i.imgur.com/OnjVZqV.png";
        thumb.alt = mod.title;
        thumb.loading = "lazy";
        thumb.onerror = () => { thumb.src = "https://i.imgur.com/OnjVZqV.png"; };
        
        thumbContainer.appendChild(thumb);
        div.appendChild(thumbContainer);
      } else {
        let thumb = document.createElement("img");
        thumb.className = "mod-thumb";
        thumb.src = mod.icon_url || "https://i.imgur.com/OnjVZqV.png";
        thumb.alt = mod.title;
        thumb.loading = "lazy";
        thumb.onerror = () => { thumb.src = "https://i.imgur.com/OnjVZqV.png"; };
        div.appendChild(thumb);
      }
    }

    // Info
    let infoDiv = document.createElement("div");
    infoDiv.className = "mod-info";

    let title = document.createElement("div");
    title.className = "mod-title";
    title.textContent = mod.title;
    infoDiv.appendChild(title);

    let desc = document.createElement("div");
    desc.className = "mod-desc";
    desc.textContent = mod.description || "";
    infoDiv.appendChild(desc);

    let meta = document.createElement("div");
    meta.className = "mod-meta";
    
    // Slug
    let slug = document.createElement("span");
    slug.className = "mod-slug";
    slug.textContent = mod.slug;
    meta.appendChild(slug);
    
    // Downloads
    let downloads = document.createElement("span");
    downloads.className = "mod-downloads";
    downloads.innerHTML = mod.downloads ? `<i class="fas fa-download"></i> ${formatNumber(mod.downloads)}` : '';
    meta.appendChild(downloads);
    
    // Category
    if (mod.categories && mod.categories.length) {
      let catName = mod.categories.find(c =>
        categories.find(cat => cat.name === c)
      );
      if (catName) {
        let catSpan = document.createElement("span");
        catSpan.className = "mod-category";
        catSpan.textContent = catName.charAt(0).toUpperCase() + catName.slice(1);
        meta.appendChild(catSpan);
      }
    }
    
    infoDiv.appendChild(meta);
    div.appendChild(infoDiv);
    modListDiv.appendChild(div);
  });
}

// Format numbers in a readable way (e.g. 1.2M)
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

// Filter mods based on search query
function filterMods() {
  let q = searchBox.value.trim().toLowerCase();
  if (!q) {
    shownMods = allMods;
  } else {
    shownMods = allMods.filter(mod =>
      mod.title.toLowerCase().includes(q) ||
      mod.slug.toLowerCase().includes(q) ||
      (mod.description || "").toLowerCase().includes(q)
    );
  }
  renderVisibleMods();
}

// Load next page of mods
async function loadMoreMods() {
  if (isLoading || currentPage >= totalPages) return;
  
  currentPage++;
  let version = mcVersionSelect.value;
  let loader = modLoaderSelect.value;
  let category = categorySelect.value;
  let sortOrder = sortOrderSelect.value;
  let search = searchBox.value.trim();
  
  const newMods = await fetchMods(version, loader, search, category, sortOrder, currentPage);
  allMods = [...allMods, ...newMods];
  shownMods = allMods;
  
  if (search) {
    filterMods();
  } else {
    renderVisibleMods();
  }
  
  statusDiv.textContent = `Loaded ${allMods.length} mods.`;
}

// Reload all mods (clear and fetch new ones)
async function reloadMods() {
  selectedMods.clear();
  downloadBtn.disabled = true;
  selectedCountSpan.textContent = "0";
  currentPage = 1;
  
  let version = mcVersionSelect.value;
  let loader = modLoaderSelect.value;
  let category = categorySelect.value;
  let sortOrder = sortOrderSelect.value;
  let search = searchBox.value.trim();
  
  allMods = await fetchMods(version, loader, search, category, sortOrder, 1);
  shownMods = allMods;
  
  renderVisibleMods();
  statusDiv.textContent = `Loaded ${allMods.length} mods.`;
}

// Add mod updater UI to the page
function addModUpdaterUI() {
  const container = document.querySelector('.container');
  const actionBar = document.querySelector('.action-bar');
  
  // Create the mod updater section
  const modUpdaterSection = document.createElement('div');
  modUpdaterSection.className = 'mod-updater-section';
  modUpdaterSection.innerHTML = `
    <h2>Update Your Mods</h2>
    <p class="updater-description">Upload your mods to check for updates to newer Minecraft versions</p>
    
    <div class="updater-controls">
      <div class="file-input-wrapper">
        <label for="modFileInput" class="file-input-label">
          <i class="fas fa-folder-open"></i> Select Mod Files
        </label>
        <input type="file" id="modFileInput" multiple accept=".jar" style="display: none;">
      </div>
      
      <div class="target-version-selector">
        <label for="targetVersionSelect">Target Version:</label>
        <select id="targetVersionSelect" class="styled-select">
          <option value="" disabled selected>Select target version</option>
        </select>
      </div>
      
      <button id="analyzeModsBtn" disabled>
        <i class="fas fa-search"></i> Analyze Mods
      </button>
    </div>
    
    <div class="updater-status" id="updaterStatus"></div>
    
    <div class="analyzed-mods-container">
      <div id="analyzedModsList" class="analyzed-mods-list"></div>
      <button id="updateModsBtn" disabled>
        <i class="fas fa-sync-alt"></i> Update Selected Mods
      </button>
    </div>
  `;
  
  // Insert the mod updater section before the action bar
  container.insertBefore(modUpdaterSection, actionBar);
  
  // Initialize the mod updater components
  initModUpdater();
}

// Initialize the mod updater functionality
function initModUpdater() {
  const modFileInput = document.getElementById('modFileInput');
  const analyzeModsBtn = document.getElementById('analyzeModsBtn');
  const updateModsBtn = document.getElementById('updateModsBtn');
  const updaterStatusDiv = document.getElementById('updaterStatus');
  const analyzedModsList = document.getElementById('analyzedModsList');
  const targetVersionSelect = document.getElementById('targetVersionSelect');
  
  // Populate target version select with MC versions
  populateTargetVersions();
  
  // Event listener for file selection
  modFileInput.addEventListener('change', () => {
    if (modFileInput.files.length > 0) {
      analyzeModsBtn.disabled = false;
      updaterStatusDiv.textContent = `${modFileInput.files.length} mod file(s) selected.`;
    } else {
      analyzeModsBtn.disabled = true;
      updaterStatusDiv.textContent = '';
    }
  });
  
  // Event listener for analyze button
  analyzeModsBtn.addEventListener('click', async () => {
    if (!modFileInput.files.length) return;
    
    updaterStatusDiv.textContent = 'Analyzing mod files...';
    analyzedModFiles = [];
    analyzedModsList.innerHTML = '';
    updateModsBtn.disabled = true;
    
    const files = Array.from(modFileInput.files);
    
    try {
      for (const file of files) {
        const modInfo = await analyzeModFile(file);
        if (modInfo) {
          analyzedModFiles.push(modInfo);
        }
      }
      
      // Display analyzed mods
      displayAnalyzedMods();
      
      if (analyzedModFiles.length > 0) {
        updaterStatusDiv.textContent = `Successfully analyzed ${analyzedModFiles.length} mod(s).`;
        updateModsBtn.disabled = false;
      } else {
        updaterStatusDiv.textContent = 'Could not identify any valid mods.';
      }
    } catch (error) {
      updaterStatusDiv.textContent = `Error analyzing mods: ${error.message}`;
    }
  });
  
  // Event listener for update button
  updateModsBtn.addEventListener('click', async () => {
    const targetVersion = targetVersionSelect.value;
    if (!targetVersion || !analyzedModFiles.length) return;
    
    updaterStatusDiv.textContent = 'Fetching mod updates...';
    await updateModsToVersion(targetVersion);
  });
}

// Populate target versions dropdown
function populateTargetVersions() {
  const targetVersionSelect = document.getElementById('targetVersionSelect');
  
  // Clear existing options
  targetVersionSelect.innerHTML = '<option value="" disabled selected>Select target version</option>';
  
  // Get MC versions from the main version select
  const options = Array.from(mcVersionSelect.options).map(opt => opt.value);
  
  // Add them to target version select
  options.forEach(version => {
    const opt = document.createElement('option');
    opt.value = version;
    opt.textContent = version;
    targetVersionSelect.appendChild(opt);
  });
}

// Analyze a mod JAR file to extract metadata
async function analyzeModFile(file) {
  // This is a placeholder for actual JAR analysis logic
  // In a real implementation, we would parse the JAR and extract mod info from fabric.mod.json, mods.toml, etc.
  
  try {
    // For now, we'll just extract potential mod ID from the filename
    // Format is usually [modid]-[mcversion]-[modversion].jar
    const filename = file.name;
    const nameMatch = filename.match(/^([a-z0-9_-]+)(?:-([0-9.]+))?(?:-([0-9.]+))?.jar$/i);
    
    if (!nameMatch) {
      console.log(`Could not parse filename: ${filename}`);
      return null;
    }
    
    const potentialModId = nameMatch[1];
    
    // Try to guess Minecraft version from filename
    let mcVersion = null;
    if (nameMatch[2] && nameMatch[2].match(/^\d+\.\d+(?:\.\d+)?$/)) {
      mcVersion = nameMatch[2];
    }
    
    // Search Modrinth for this mod
    const searchUrl = `${MODRINTH_API}/search?query=${encodeURIComponent(potentialModId)}&limit=5`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    // Find potential matches
    const possibleMods = data.hits.filter(mod => 
      mod.slug === potentialModId.toLowerCase() || 
      mod.title.toLowerCase().includes(potentialModId.toLowerCase())
    );
    
    if (possibleMods.length === 0) {
      console.log(`No matches found for ${potentialModId}`);
      return null;
    }
    
    // Take the most likely match
    const mod = possibleMods[0];
    
    return {
      originalFile: file,
      fileName: file.name,
      modId: mod.slug,
      title: mod.title,
      currentVersion: mcVersion || 'Unknown',
      projectId: mod.project_id,
      icon: mod.icon_url || "https://i.imgur.com/OnjVZqV.png"
    };
  } catch (error) {
    console.error(`Error analyzing mod file ${file.name}:`, error);
    return null;
  }
}

// Display the analyzed mods in the UI
function displayAnalyzedMods() {
  const analyzedModsList = document.getElementById('analyzedModsList');
  analyzedModsList.innerHTML = '';
  
  if (analyzedModFiles.length === 0) {
    analyzedModsList.innerHTML = '<p class="empty-state">No mods could be analyzed.</p>';
    return;
  }
  
  analyzedModFiles.forEach((mod, index) => {
    const modItem = document.createElement('div');
    modItem.className = 'analyzed-mod-item';
    modItem.innerHTML = `
      <input type="checkbox" class="mod-checkbox" value="${mod.modId}" checked>
      <img src="${mod.icon}" class="mod-icon" onerror="this.src='https://i.imgur.com/OnjVZqV.png'">
      <div class="mod-info">
        <div class="mod-title">${mod.title}</div>
        <div class="mod-filename">${mod.fileName}</div>
        <div class="mod-current-version">Current Version: ${mod.currentVersion}</div>
      </div>
    `;
    
    analyzedModsList.appendChild(modItem);
  });
}

// Update mods to a newer Minecraft version
async function updateModsToVersion(targetVersion) {
  const updaterStatusDiv = document.getElementById('updaterStatus');
  const analyzedModsList = document.getElementById('analyzedModsList');
  const checkboxes = analyzedModsList.querySelectorAll('.mod-checkbox:checked');
  
  if (checkboxes.length === 0) {
    updaterStatusDiv.textContent = 'No mods selected for updating.';
    return;
  }
  
  updaterStatusDiv.textContent = 'Fetching updated versions...';
  
  // Get the currently selected mod loader
  const loader = modLoaderSelect.value;
  
  // Keep track of successes and failures
  let successCount = 0;
  let failCount = 0;
  
  for (const checkbox of checkboxes) {
    const modId = checkbox.value;
    const modItem = checkbox.closest('.analyzed-mod-item');
    const modInfo = analyzedModFiles.find(m => m.modId === modId);
    
    if (!modInfo) continue;
    
    try {
      // Add a loading indicator
      modItem.classList.add('loading');
      
      // Fetch available versions for this mod
      const versionsUrl = `${MODRINTH_API}/project/${modInfo.projectId}/version?game_versions=["${targetVersion}"]&loaders=["${loader}"]`;
      const response = await fetch(versionsUrl);
      const versions = await response.json();
      
      if (!versions.length) {
        // No compatible version found
        modItem.classList.remove('loading');
        modItem.classList.add('error');
        const versionInfo = modItem.querySelector('.mod-current-version');
        versionInfo.textContent = `No compatible version for ${targetVersion}`;
        failCount++;
        continue;
      }
      
      // Find the jar file to download
      const latestVersion = versions[0];
      const jarFile = latestVersion.files.find(f => f.filename.endsWith('.jar'));
      
      if (!jarFile) {
        modItem.classList.remove('loading');
        modItem.classList.add('error');
        const versionInfo = modItem.querySelector('.mod-current-version');
        versionInfo.textContent = 'No JAR file found';
        failCount++;
        continue;
      }
      
      // Download the file
      const a = document.createElement('a');
      a.href = jarFile.url;
      a.download = jarFile.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Update UI
      modItem.classList.remove('loading');
      modItem.classList.add('success');
      const versionInfo = modItem.querySelector('.mod-current-version');
      versionInfo.innerHTML = `Updated to: <span class="updated-version">${targetVersion}</span> (${latestVersion.version_number})`;
      
      successCount++;
      
      // Add a small delay to prevent browser throttling
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      modItem.classList.remove('loading');
      modItem.classList.add('error');
      const versionInfo = modItem.querySelector('.mod-current-version');
      versionInfo.textContent = `Error: ${error.message}`;
      failCount++;
    }
  }
  
  updaterStatusDiv.textContent = `Update complete! ${successCount} mod(s) updated successfully, ${failCount} failed.`;
}

// Event Listeners
filterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await reloadMods();
});

searchBox.addEventListener('input', filterMods);
loadMoreBtn.addEventListener('click', loadMoreMods);

// Event listener for downloading selected mods
downloadBtn.addEventListener('click', async () => {
  if (!selectedMods.size) return;
  
  let modsToDownload = shownMods.filter(m => selectedMods.has(m.slug));
  let version = mcVersionSelect.value;
  let loader = modLoaderSelect.value;
  
  statusDiv.textContent = "Fetching mod files...";
  
  for (let i = 0; i < modsToDownload.length; i++) {
    let mod = modsToDownload[i];
    statusDiv.textContent = `Downloading ${mod.title} (${i+1}/${modsToDownload.length})...`;
    
    try {
      let vurl = `${MODRINTH_API}/project/${mod.slug}/version?game_versions=["${version}"]&loaders=["${loader}"]`;
      let vresp = await fetch(vurl);
      let versions = await vresp.json();
      
      if (!versions.length) {
        statusDiv.textContent += `\nNo compatible version for ${mod.title}.`;
        continue;
      }
      
      let file = versions[0].files.find(f => f.filename.endsWith(".jar"));
      if (!file) {
        statusDiv.textContent += `\nNo jar file for ${mod.title}.`;
        continue;
      }
      
      // Download file
      let a = document.createElement("a");
      a.href = file.url;
      a.download = file.filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Animate download button
      downloadBtn.classList.add("downloading");
      setTimeout(() => {
        downloadBtn.classList.remove("downloading");
      }, 300);
      
      // Add a small delay between downloads to prevent browser throttling
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      statusDiv.textContent += `\nError downloading ${mod.title}: ${e}`;
    }
  }
  
  statusDiv.textContent = "All done! Check your downloads folder.";
});

// Initialize the application
window.addEventListener("DOMContentLoaded", async () => {
  initViewMode();
  await fetchVersions();
  await fetchCategories();
  await reloadMods();
  addModUpdaterUI();
});

// Add event listeners for category select and sort order changes
categorySelect.addEventListener('change', () => {
  // Update active category tags based on dropdown selection
  activeCategoryTags.clear();
  if (categorySelect.value) {
    activeCategoryTags.add(categorySelect.value);
  }
  renderCategoryTags();
  reloadMods();
});

sortOrderSelect.addEventListener('change', reloadMods);
mcVersionSelect.addEventListener('change', reloadMods);
modLoaderSelect.addEventListener('change', reloadMods);

// Memory optimization: Use IntersectionObserver to detect when list is scrolled
const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !isLoading && currentPage < totalPages) {
    loadMoreMods();
  }
}, { rootMargin: '200px' });

// Observe the load more button for infinite scroll-like behavior
observer.observe(loadMoreBtn);
