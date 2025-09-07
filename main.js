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

// Update mode elements
const modeButtons = document.querySelectorAll('.mode-btn');
const modeContents = document.querySelectorAll('.mode-content');
const folderInput = document.getElementById('folderInput');
const fileInput = document.getElementById('fileInput');
const folderSelectBtn = document.getElementById('folderSelectBtn');
const fileSelectBtn = document.getElementById('fileSelectBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const updateAllBtn = document.getElementById('updateAllBtn');
const currentVersionSpan = document.getElementById('currentVersion');
const detectedModsCountSpan = document.getElementById('detectedModsCount');
const availableUpdatesCountSpan = document.getElementById('availableUpdatesCount');
const targetVersionSelect = document.getElementById('targetVersion');
const detectedModsDiv = document.getElementById('detectedMods');
const updateStatusDiv = document.getElementById('updateStatus');
const steps = document.querySelectorAll('.step');

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

// For update mode
let detectedMods = [];
let detectedVersion = null;
let availableUpdates = 0;

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

// Function to initialize mode switching
function initModeSwitching() {
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const mode = btn.dataset.mode;
      modeContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${mode}Mode`) {
          content.classList.add('active');
        }
      });
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
    
    // Populate main version select
    mcVersionSelect.innerHTML = "";
    stable.forEach(v => {
      let opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      mcVersionSelect.appendChild(opt);
    });
    mcVersionSelect.value = stable.find(v => v === "1.20.1") || stable[0];
    
    // Populate target version select (for updates)
    targetVersionSelect.innerHTML = "";
    stable.forEach(v => {
      let opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      targetVersionSelect.appendChild(opt);
    });
    targetVersionSelect.value = stable.find(v => v === "1.20.1") || stable[0];
    
    statusDiv.textContent = "";
  } catch (e) {
    mcVersionSelect.innerHTML = "<option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
    targetVersionSelect.innerHTML = "<option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
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

// Event Listeners for Browse Mode
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

// Update Mode Functions

// Initialize file inputs
function initFileInputs() {
  folderSelectBtn.addEventListener('click', () => {
    folderInput.click();
  });
  
  fileSelectBtn.addEventListener('click', () => {
    fileInput.click();
  });
  
  folderInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(file => file.name.endsWith('.jar'));
      if (files.length > 0) {
        updateStatusDiv.innerHTML = `<div class="status-info">Selected ${files.length} mod files from folder</div>`;
        analyzeBtn.disabled = false;
        setActiveStep(1);
      } else {
        updateStatusDiv.innerHTML = `<div class="status-warning">No mod files (.jar) found in the selected folder</div>`;
        analyzeBtn.disabled = true;
      }
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      updateStatusDiv.innerHTML = `<div class="status-info">Selected ${e.target.files.length} mod files</div>`;
      analyzeBtn.disabled = false;
      setActiveStep(1);
    } else {
      updateStatusDiv.innerHTML = '';
      analyzeBtn.disabled = true;
    }
  });
  
  analyzeBtn.addEventListener('click', analyzeMods);
  updateAllBtn.addEventListener('click', updateAllMods);
  targetVersionSelect.addEventListener('change', checkUpdatesAvailability);
}

// Set active step in the wizard
function setActiveStep(stepIndex) {
  steps.forEach((step, idx) => {
    step.classList.toggle('active', idx === stepIndex);
    step.classList.toggle('complete', idx < stepIndex);
  });
}

// Extract JAR file metadata
async function extractJarMetadata(file) {
  try {
    // Create a new JSZip instance
    const JSZip = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    const zip = new JSZip.default();
    
    // Read the JAR file as an ArrayBuffer
    const content = await file.arrayBuffer();
    const loadedZip = await zip.loadAsync(content);
    
    // Look for fabric.mod.json, mods.toml, or mcmod.info
    let modInfo = null;
    let modLoader = null;
    let modId = null;
    let modName = null;
    let modVersion = null;
    let minecraftVersion = null;
    
    // Try to find Fabric mod info
    if (loadedZip.files['fabric.mod.json']) {
      const fabricModJson = await loadedZip.files['fabric.mod.json'].async('string');
      const fabricInfo = JSON.parse(fabricModJson);
      modLoader = 'fabric';
      modId = fabricInfo.id;
      modName = fabricInfo.name || fabricInfo.id;
      modVersion = fabricInfo.version;
      
      if (fabricInfo.depends && fabricInfo.depends.minecraft) {
        minecraftVersion = fabricInfo.depends.minecraft.replace(/[\^\~]/g, '');
      }
    }
    // Try to find Forge mod info
    else if (loadedZip.files['META-INF/mods.toml']) {
      const modsToml = await loadedZip.files['META-INF/mods.toml'].async('string');
      modLoader = 'forge';
      
      // Simple TOML parsing (basic approach)
      const modIdMatch = modsToml.match(/modId\s*=\s*["']([^"']+)["']/);
      const modNameMatch = modsToml.match(/displayName\s*=\s*["']([^"']+)["']/);
      const modVersionMatch = modsToml.match(/version\s*=\s*["']([^"']+)["']/);
      const minecraftVersionMatch = modsToml.match(/minecraft\s*=\s*["']([^"']+)["']/);
      
      if (modIdMatch) modId = modIdMatch[1];
      if (modNameMatch) modName = modNameMatch[1];
      if (modVersionMatch) modVersion = modVersionMatch[1];
      if (minecraftVersionMatch) {
        minecraftVersion = minecraftVersionMatch[1].replace(/[\^\~]/g, '');
      }
    }
    // Try to find older Forge mod info
    else if (loadedZip.files['mcmod.info']) {
      const mcmodInfo = await loadedZip.files['mcmod.info'].async('string');
      try {
        const mcmodJson = JSON.parse(mcmodInfo);
        modLoader = 'forge';
        
        if (Array.isArray(mcmodJson) && mcmodJson.length > 0) {
          modId = mcmodJson[0].modid;
          modName = mcmodJson[0].name || mcmodJson[0].modid;
          modVersion = mcmodJson[0].version;
          if (mcmodJson[0].mcversion) {
            minecraftVersion = mcmodJson[0].mcversion;
          }
        }
      } catch (e) {
        console.error('Error parsing mcmod.info:', e);
      }
    }
    
    // If we couldn't find version info in the metadata, try to infer from filename
    if (!minecraftVersion) {
      const filenameMatch = file.name.match(/(?:mc|minecraft)[-_]?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
      if (filenameMatch) {
        minecraftVersion = filenameMatch[1];
      }
    }
    
    return {
      filename: file.name,
      modId,
      modName: modName || file.name.replace('.jar', ''),
      modVersion,
      minecraftVersion,
      modLoader,
      fileSize: file.size,
      lastModified: new Date(file.lastModified).toISOString()
    };
  } catch (e) {
    console.error('Error extracting JAR metadata:', e);
    return {
      filename: file.name,
      modId: null,
      modName: file.name.replace('.jar', ''),
      modVersion: null,
      minecraftVersion: null,
      modLoader: null,
      fileSize: file.size,
      lastModified: new Date(file.lastModified).toISOString(),
      error: e.message
    };
  }
}

// Analyze mods from selected files
async function analyzeMods() {
  updateStatusDiv.innerHTML = `<div class="status-info">Analyzing mod files... Please wait.</div>`;
  analyzeBtn.disabled = true;
  setActiveStep(1);
  
  let files = [];
  if (folderInput.files.length > 0) {
    files = Array.from(folderInput.files).filter(file => file.name.endsWith('.jar'));
  } else if (fileInput.files.length > 0) {
    files = Array.from(fileInput.files);
  }
  
  if (files.length === 0) {
    updateStatusDiv.innerHTML = `<div class="status-error">No mod files selected</div>`;
    analyzeBtn.disabled = false;
    return;
  }
  
  try {
    // Extract metadata from each JAR file
    detectedMods = [];
    let versionCounts = {};
    let loaderCounts = {};
    
    for (let i = 0; i < files.length; i++) {
      updateStatusDiv.innerHTML = `
        <div class="status-info">
          <div class="progress-bar">
            <div class="progress" style="width: ${Math.round((i + 1) / files.length * 100)}%"></div>
          </div>
          Analyzing ${i + 1}/${files.length}: ${files[i].name}
        </div>
      `;
      
      const metadata = await extractJarMetadata(files[i]);
      detectedMods.push(metadata);
      
      if (metadata.minecraftVersion) {
        versionCounts[metadata.minecraftVersion] = (versionCounts[metadata.minecraftVersion] || 0) + 1;
      }
      
      if (metadata.modLoader) {
        loaderCounts[metadata.modLoader] = (loaderCounts[metadata.modLoader] || 0) + 1;
      }
    }
    
    // Determine the most common Minecraft version
    let mostCommonVersion = null;
    let highestCount = 0;
    for (const [version, count] of Object.entries(versionCounts)) {
      if (count > highestCount) {
        mostCommonVersion = version;
        highestCount = count;
      }
    }
    
    // Determine the most common mod loader
    let mostCommonLoader = null;
    highestCount = 0;
    for (const [loader, count] of Object.entries(loaderCounts)) {
      if (count > highestCount) {
        mostCommonLoader = loader;
        highestCount = count;
      }
    }
    
    // Update UI with analysis results
    detectedVersion = mostCommonVersion;
    currentVersionSpan.textContent = detectedVersion || 'Unknown';
    detectedModsCountSpan.textContent = detectedMods.length;
    
    // Enable target version select
    targetVersionSelect.disabled = false;
    setActiveStep(2);
    
    // Render detected mods
    renderDetectedMods();
    
    // Check for available updates
    await checkUpdatesAvailability();
  } catch (e) {
    updateStatusDiv.innerHTML = `<div class="status-error">Error analyzing mods: ${e.message}</div>`;
    analyzeBtn.disabled = false;
  }
}

// Render detected mods list
function renderDetectedMods() {
  detectedModsDiv.innerHTML = '';
  
  if (detectedMods.length === 0) {
    detectedModsDiv.innerHTML = '<p class="empty-state">No mods detected</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'mods-table';
  
  // Table header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Mod Name</th>
      <th>ID</th>
      <th>Minecraft Version</th>
      <th>Mod Version</th>
      <th>Loader</th>
      <th>Status</th>
    </tr>
  `;
  table.appendChild(thead);
  
  // Table body
  const tbody = document.createElement('tbody');
  detectedMods.forEach((mod, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${mod.modName || 'Unknown'}</td>
      <td>${mod.modId || 'Unknown'}</td>
      <td>${mod.minecraftVersion || 'Unknown'}</td>
      <td>${mod.modVersion || 'Unknown'}</td>
      <td>${mod.modLoader || 'Unknown'}</td>
      <td class="mod-status" data-index="${index}">
        <span class="status-pending">Pending</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  detectedModsDiv.appendChild(table);
}

// Check availability of updates for the target version
async function checkUpdatesAvailability() {
  if (!detectedMods.length || !detectedVersion) {
    return;
  }
  
  const targetVersion = targetVersionSelect.value;
  updateStatusDiv.innerHTML = `<div class="status-info">Checking for updates to ${targetVersion}...</div>`;
  
  try {
    availableUpdates = 0;
    
    for (let i = 0; i < detectedMods.length; i++) {
      const mod = detectedMods[i];
      const statusCell = document.querySelector(`.mod-status[data-index="${i}"]`);
      
      if (!mod.modId) {
        statusCell.innerHTML = `<span class="status-warning">Cannot check (no mod ID)</span>`;
        continue;
      }
      
      // Search for mod by ID on Modrinth
      const searchUrl = `${MODRINTH_API}/search?query=${encodeURIComponent(mod.modId)}`;
      const searchResp = await fetch(searchUrl);
      const searchResults = await searchResp.json();
      
      // Find exact match
      const exactMatch = searchResults.hits.find(hit => 
        hit.slug === mod.modId || 
        hit.project_id === mod.modId
      );
      
      if (!exactMatch) {
        statusCell.innerHTML = `<span class="status-warning">Not found on Modrinth</span>`;
        continue;
      }
      
      // Check if target version is available
      const versionUrl = `${MODRINTH_API}/project/${exactMatch.project_id}/version?game_versions=["${targetVersion}"]`;
      const versionResp = await fetch(versionUrl);
      const versions = await versionResp.json();
      
      if (versions.length > 0) {
        statusCell.innerHTML = `
          <span class="status-success">Update available</span>
          <button class="update-btn" data-project-id="${exactMatch.project_id}" data-index="${i}">
            <i class="fas fa-download"></i>
          </button>
        `;
        availableUpdates++;
        
        // Add event listener for update button
        setTimeout(() => {
          const updateBtn = statusCell.querySelector('.update-btn');
          if (updateBtn) {
            updateBtn.addEventListener('click', (e) => {
              downloadModUpdate(exactMatch.project_id, targetVersion, mod.modLoader);
            });
          }
        }, 0);
      } else {
        statusCell.innerHTML = `<span class="status-error">No version for ${targetVersion}</span>`;
      }
    }
    
    // Update UI
    availableUpdatesCountSpan.textContent = availableUpdates;
    updateAllBtn.disabled = availableUpdates === 0;
    
    if (availableUpdates > 0) {
      updateStatusDiv.innerHTML = `<div class="status-success">${availableUpdates} updates available for ${targetVersion}!</div>`;
    } else {
      updateStatusDiv.innerHTML = `<div class="status-warning">No updates available for ${targetVersion}</div>`;
    }
  } catch (e) {
    updateStatusDiv.innerHTML = `<div class="status-error">Error checking for updates: ${e.message}</div>`;
  }
}

// Download a single mod update
async function downloadModUpdate(projectId, targetVersion, loader) {
  try {
    updateStatusDiv.innerHTML = `<div class="status-info">Downloading mod update...</div>`;
    
    // Get compatible versions
    const versionUrl = `${MODRINTH_API}/project/${projectId}/version?game_versions=["${targetVersion}"]`;
    const versionResp = await fetch(versionUrl);
    const versions = await versionResp.json();
    
    if (!versions.length) {
      updateStatusDiv.innerHTML = `<div class="status-error">No compatible version found</div>`;
      return;
    }
    
    // Filter by loader if specified
    let compatibleVersions = versions;
    if (loader) {
      compatibleVersions = versions.filter(v => v.loaders.includes(loader));
      if (!compatibleVersions.length) {
        // Fall back to all versions if no loader match
        compatibleVersions = versions;
      }
    }
    
    // Get the latest version
    const latestVersion = compatibleVersions[0];
    const file = latestVersion.files.find(f => f.filename.endsWith('.jar'));
    
    if (!file) {
      updateStatusDiv.innerHTML = `<div class="status-error">No JAR file found for download</div>`;
      return;
    }
    
    // Download file
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    updateStatusDiv.innerHTML = `<div class="status-success">Downloaded ${file.filename}</div>`;
  } catch (e) {
    updateStatusDiv.innerHTML = `<div class="status-error">Error downloading mod: ${e.message}</div>`;
  }
}

// Update all available mods
async function updateAllMods() {
  if (availableUpdates === 0) {
    return;
  }
  
  const targetVersion = targetVersionSelect.value;
  updateStatusDiv.innerHTML = `<div class="status-info">Updating all mods to ${targetVersion}...</div>`;
  updateAllBtn.disabled = true;
  
  try {
    let downloadCount = 0;
    const updateButtons = document.querySelectorAll('.update-btn');
    
    for (let i = 0; i < updateButtons.length; i++) {
      const btn = updateButtons[i];
      const projectId = btn.dataset.projectId;
      const index = parseInt(btn.dataset.index);
      const mod = detectedMods[index];
      
      updateStatusDiv.innerHTML = `
        <div class="status-info">
          <div class="progress-bar">
            <div class="progress" style="width: ${Math.round((i + 1) / updateButtons.length * 100)}%"></div>
          </div>
          Updating ${i + 1}/${updateButtons.length}: ${mod.modName}
        </div>
      `;
      
      await downloadModUpdate(projectId, targetVersion, mod.modLoader);
      downloadCount++;
      
      // Small delay between downloads to prevent browser throttling
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    updateStatusDiv.innerHTML = `<div class="status-success">Successfully downloaded ${downloadCount} mod updates!</div>`;
  } catch (e) {
    updateStatusDiv.innerHTML = `<div class="status-error">Error updating mods: ${e.message}</div>`;
  } finally {
    updateAllBtn.disabled = false;
  }
}

// Initialize the application
window.addEventListener("DOMContentLoaded", async () => {
  initViewMode();
  initModeSwitching();
  initFileInputs();
  await fetchVersions();
  await fetchCategories();
  await reloadMods();
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