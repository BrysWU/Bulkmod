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

// New variables for mod updater
let uploadedMods = [];
let targetVersion = "";
let availableUpdates = [];

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
    
    // Also populate target version select if it exists
    const targetVersionSelect = document.getElementById('targetVersion');
    if (targetVersionSelect) {
      targetVersionSelect.innerHTML = "";
      stable.forEach(v => {
        let opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        targetVersionSelect.appendChild(opt);
      });
      targetVersionSelect.value = stable[0];
    }
    
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

// Add the UI components for mod updater
function addModUpdaterUI() {
  // Create the mod updater section and add it to the DOM
  const container = document.querySelector('.container');
  const actionBar = document.querySelector('.action-bar');
  
  const updaterSection = document.createElement('div');
  updaterSection.className = 'mod-updater-section';
  updaterSection.innerHTML = `
    <h2 class="section-title">Update Your Mods</h2>
    <p class="section-desc">Select your mods folder or individual mod files to update them to a newer Minecraft version.</p>
    
    <div class="updater-container">
      <div class="form-row">
        <div class="form-group">
          <label for="fileInput">Select Mod Files</label>
          <div class="file-input-wrapper">
            <input type="file" id="fileInput" multiple accept=".jar,.zip" />
            <label for="fileInput" class="file-input-label">
              <i class="fas fa-upload"></i> Choose Files
            </label>
            <span id="fileCount" class="file-count">No files selected</span>
          </div>
        </div>
        
        <div class="form-group">
          <label for="targetVersion">Target Version</label>
          <select id="targetVersion" class="styled-select">
            <option value="1.20.1">1.20.1</option>
            <option value="1.19.4">1.19.4</option>
            <option value="1.18.2">1.18.2</option>
            <option value="1.17.1">1.17.1</option>
            <option value="1.16.5">1.16.5</option>
          </select>
        </div>
        
        <button type="button" id="analyzeBtn" class="analyze-btn">
          <i class="fas fa-search"></i> Analyze Mods
        </button>
      </div>
      
      <div id="analyzeStatus" class="analyze-status"></div>
      
      <div id="updateResults" class="update-results">
        <div class="update-header">
          <span class="update-title">Detected Mods</span>
          <span class="update-count" id="updateCount">0 updates available</span>
        </div>
        <div id="updateList" class="update-list"></div>
        <button type="button" id="updateAllBtn" class="update-all-btn" disabled>
          <i class="fas fa-sync-alt"></i> Update All Mods
        </button>
      </div>
    </div>
  `;
  
  container.insertBefore(updaterSection, actionBar);
  
  // Add event listeners for the new UI elements
  const fileInput = document.getElementById('fileInput');
  const fileCount = document.getElementById('fileCount');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const updateAllBtn = document.getElementById('updateAllBtn');
  const analyzeStatus = document.getElementById('analyzeStatus');
  const updateList = document.getElementById('updateList');
  const targetVersionSelect = document.getElementById('targetVersion');
  
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      fileCount.textContent = `${files.length} file(s) selected`;
      uploadedMods = Array.from(files);
    } else {
      fileCount.textContent = 'No files selected';
      uploadedMods = [];
    }
    
    // Clear previous results
    analyzeStatus.textContent = '';
    updateList.innerHTML = '';
    updateAllBtn.disabled = true;
    availableUpdates = [];
  });
  
  analyzeBtn.addEventListener('click', () => {
    if (uploadedMods.length === 0) {
      analyzeStatus.textContent = 'Please select at least one mod file.';
      analyzeStatus.className = 'analyze-status error';
      return;
    }
    
    targetVersion = targetVersionSelect.value;
    analyzeModFiles();
  });
  
  updateAllBtn.addEventListener('click', () => {
    downloadAllUpdates();
  });
  
  // Populate the target version dropdown with real Minecraft versions
  fetchVersions();
}

// Analyze the uploaded mod files
async function analyzeModFiles() {
  const analyzeStatus = document.getElementById('analyzeStatus');
  const updateList = document.getElementById('updateList');
  const updateCount = document.getElementById('updateCount');
  const updateAllBtn = document.getElementById('updateAllBtn');
  
  analyzeStatus.textContent = 'Analyzing mod files...';
  analyzeStatus.className = 'analyze-status loading';
  updateList.innerHTML = '';
  availableUpdates = [];
  
  try {
    // Process each file
    for (let i = 0; i < uploadedMods.length; i++) {
      const file = uploadedMods[i];
      analyzeStatus.textContent = `Analyzing ${i+1}/${uploadedMods.length}: ${file.name}`;
      
      // Extract mod information from the file
      const modInfo = await extractModInfo(file);
      
      if (modInfo) {
        // Find updates for the mod
        const updates = await findModUpdates(modInfo);
        if (updates) {
          availableUpdates.push({
            originalFile: file,
            modInfo: modInfo,
            updates: updates
          });
        }
      }
    }
    
    // Display results
    if (availableUpdates.length > 0) {
      analyzeStatus.textContent = 'Analysis complete! Updates available.';
      analyzeStatus.className = 'analyze-status success';
      updateCount.textContent = `${availableUpdates.length} updates available`;
      updateAllBtn.disabled = false;
      
      // Render the update list
      renderUpdateList();
    } else {
      analyzeStatus.textContent = 'No updates found for your mods.';
      analyzeStatus.className = 'analyze-status warning';
      updateCount.textContent = '0 updates available';
      updateAllBtn.disabled = true;
    }
  } catch (error) {
    analyzeStatus.textContent = `Error analyzing mods: ${error.message}`;
    analyzeStatus.className = 'analyze-status error';
    updateAllBtn.disabled = true;
  }
}

// Extract mod information from a file
async function extractModInfo(file) {
  try {
    // For simplicity, just extract mod ID from filename (in a real implementation, you'd parse the JAR)
    // Example filename: jei-1.18.2-9.7.0.195.jar
    const filename = file.name.toLowerCase();
    
    if (!filename.endsWith('.jar')) {
      return null; // Not a JAR file
    }
    
    // Extract mod ID and version from filename
    // This is a simplified approach - a real implementation would parse the mod.toml or fabric.mod.json
    const filenamePattern = /^([\w-]+)-([\d.]+(?:-[\d.]+)+)\.jar$/;
    const match = filename.match(filenamePattern);
    
    if (match) {
      const modId = match[1];
      const version = match[2];
      
      // Try to extract Minecraft version from the version string
      const mcVersionPattern = /(1\.\d+(?:\.\d+)?)/;
      const mcVersionMatch = version.match(mcVersionPattern);
      const mcVersion = mcVersionMatch ? mcVersionMatch[1] : null;
      
      return {
        modId: modId,
        version: version,
        mcVersion: mcVersion,
        filename: file.name
      };
    }
    
    // Fallback method - try to search for the mod by name on Modrinth
    const modName = filename.replace('.jar', '');
    const searchResponse = await fetch(`${MODRINTH_API}/search?query=${encodeURIComponent(modName)}`);
    const searchResults = await searchResponse.json();
    
    if (searchResults.hits && searchResults.hits.length > 0) {
      const topMatch = searchResults.hits[0];
      
      return {
        modId: topMatch.slug,
        projectId: topMatch.project_id,
        title: topMatch.title,
        mcVersion: "unknown", // We don't know the exact version
        filename: file.name
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting mod info:", error);
    return null;
  }
}

// Find updates for a mod
async function findModUpdates(modInfo) {
  try {
    if (!modInfo.modId) return null;
    
    // Try to fetch the project data
    let projectResponse;
    if (modInfo.projectId) {
      projectResponse = await fetch(`${MODRINTH_API}/project/${modInfo.projectId}`);
    } else {
      projectResponse = await fetch(`${MODRINTH_API}/project/${modInfo.modId}`);
    }
    
    // If the project isn't found by slug, try to search for it
    if (!projectResponse.ok) {
      const searchResponse = await fetch(`${MODRINTH_API}/search?query=${encodeURIComponent(modInfo.modId)}`);
      const searchResults = await searchResponse.json();
      
      if (searchResults.hits && searchResults.hits.length > 0) {
        const topMatch = searchResults.hits[0];
        projectResponse = await fetch(`${MODRINTH_API}/project/${topMatch.project_id}`);
      }
    }
    
    if (!projectResponse.ok) {
      return null;
    }
    
    const project = await projectResponse.json();
    
    // Fetch the versions for the target Minecraft version
    const versionsResponse = await fetch(`${MODRINTH_API}/project/${project.id}/version?game_versions=["${targetVersion}"]`);
    const versions = await versionsResponse.json();
    
    if (versions.length === 0) {
      return null; // No versions for the target Minecraft version
    }
    
    // Return the latest version for each loader
    const loaderVersions = {};
    versions.forEach(v => {
      v.loaders.forEach(loader => {
        if (!loaderVersions[loader] || new Date(v.date_published) > new Date(loaderVersions[loader].date_published)) {
          loaderVersions[loader] = v;
        }
      });
    });
    
    return {
      project: project,
      versions: Object.values(loaderVersions)
    };
    
  } catch (error) {
    console.error("Error finding mod updates:", error);
    return null;
  }
}

// Render the update list
function renderUpdateList() {
  const updateList = document.getElementById('updateList');
  updateList.innerHTML = '';
  
  availableUpdates.forEach((update, index) => {
    const updateItem = document.createElement('div');
    updateItem.className = 'update-item';
    updateItem.dataset.index = index;
    
    // Original mod info
    const originalInfo = document.createElement('div');
    originalInfo.className = 'original-info';
    
    const originalTitle = document.createElement('div');
    originalTitle.className = 'original-title';
    originalTitle.textContent = update.modInfo.title || update.modInfo.modId;
    originalInfo.appendChild(originalTitle);
    
    const originalFile = document.createElement('div');
    originalFile.className = 'original-file';
    originalFile.textContent = update.modInfo.filename;
    originalInfo.appendChild(originalFile);
    
    if (update.modInfo.mcVersion && update.modInfo.mcVersion !== "unknown") {
      const originalVersion = document.createElement('div');
      originalVersion.className = 'original-version';
      originalVersion.textContent = `MC ${update.modInfo.mcVersion}`;
      originalInfo.appendChild(originalVersion);
    }
    
    // Available updates
    const updateOptions = document.createElement('div');
    updateOptions.className = 'update-options';
    
    if (update.updates && update.updates.project) {
      const projectTitle = document.createElement('div');
      projectTitle.className = 'project-title';
      projectTitle.textContent = update.updates.project.title;
      updateOptions.appendChild(projectTitle);
      
      if (update.updates.versions && update.updates.versions.length > 0) {
        const loaderSelect = document.createElement('select');
        loaderSelect.className = 'loader-select styled-select';
        update.updates.versions.forEach(version => {
          const option = document.createElement('option');
          option.value = version.id;
          option.textContent = `${version.version_number} (${version.loaders.join(', ')})`;
          loaderSelect.appendChild(option);
        });
        updateOptions.appendChild(loaderSelect);
      }
    } else {
      const noUpdates = document.createElement('div');
      noUpdates.className = 'no-updates';
      noUpdates.textContent = 'No compatible updates found';
      updateOptions.appendChild(noUpdates);
    }
    
    // Update button
    const updateBtn = document.createElement('button');
    updateBtn.className = 'update-btn';
    updateBtn.innerHTML = '<i class="fas fa-download"></i>';
    updateBtn.title = 'Download update';
    updateBtn.disabled = !update.updates || !update.updates.versions || update.updates.versions.length === 0;
    updateBtn.addEventListener('click', () => {
      downloadModUpdate(index);
    });
    
    // Assemble the item
    updateItem.appendChild(originalInfo);
    updateItem.appendChild(updateOptions);
    updateItem.appendChild(updateBtn);
    updateList.appendChild(updateItem);
  });
}

// Download a specific mod update
async function downloadModUpdate(index) {
  const update = availableUpdates[index];
  if (!update || !update.updates || !update.updates.versions || update.updates.versions.length === 0) return;
  
  const updateItem = document.querySelector(`.update-item[data-index="${index}"]`);
  const loaderSelect = updateItem.querySelector('.loader-select');
  const updateBtn = updateItem.querySelector('.update-btn');
  
  // Get the selected version
  const versionId = loaderSelect.value;
  const version = update.updates.versions.find(v => v.id === versionId);
  if (!version) return;
  
  try {
    updateBtn.disabled = true;
    updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    // Find the primary JAR file
    const file = version.files.find(f => f.primary) || version.files[0];
    
    // Download the file
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    updateBtn.innerHTML = '<i class="fas fa-check"></i>';
    updateBtn.classList.add('success');
    
    setTimeout(() => {
      updateBtn.disabled = false;
      updateBtn.innerHTML = '<i class="fas fa-download"></i>';
      updateBtn.classList.remove('success');
    }, 2000);
    
  } catch (error) {
    console.error("Error downloading update:", error);
    updateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
    updateBtn.classList.add('error');
    
    setTimeout(() => {
      updateBtn.disabled = false;
      updateBtn.innerHTML = '<i class="fas fa-download"></i>';
      updateBtn.classList.remove('error');
    }, 2000);
  }
}

// Download all available updates
async function downloadAllUpdates() {
  const updateAllBtn = document.getElementById('updateAllBtn');
  const analyzeStatus = document.getElementById('analyzeStatus');
  
  if (availableUpdates.length === 0) return;
  
  updateAllBtn.disabled = true;
  updateAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading Updates...';
  
  try {
    for (let i = 0; i < availableUpdates.length; i++) {
      const update = availableUpdates[i];
      
      if (!update.updates || !update.updates.versions || update.updates.versions.length === 0) {
        continue;
      }
      
      analyzeStatus.textContent = `Downloading update ${i+1}/${availableUpdates.length}...`;
      
      // Get the first version (usually the best match)
      const version = update.updates.versions[0];
      
      // Find the primary JAR file
      const file = version.files.find(f => f.primary) || version.files[0];
      
      // Download the file
      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Add a small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    analyzeStatus.textContent = 'All updates downloaded successfully!';
    analyzeStatus.className = 'analyze-status success';
    updateAllBtn.innerHTML = '<i class="fas fa-check"></i> Updates Downloaded';
    
    setTimeout(() => {
      updateAllBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Update All Mods';
      updateAllBtn.disabled = false;
    }, 2000);
    
  } catch (error) {
    console.error("Error downloading all updates:", error);
    analyzeStatus.textContent = `Error downloading updates: ${error.message}`;
    analyzeStatus.className = 'analyze-status error';
    updateAllBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Update All Mods';
    updateAllBtn.disabled = false;
  }
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
  
  // Add the mod updater UI
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
