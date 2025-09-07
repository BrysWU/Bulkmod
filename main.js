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

// Update tab elements
const modFolderInput = document.getElementById('modFolderInput');
const modFilesInput = document.getElementById('modFilesInput');
const detectedVersionSpan = document.getElementById('detectedVersion');
const targetVersionSelect = document.getElementById('targetVersion');
const analysisStatusDiv = document.getElementById('analysisStatus');
const analysisProgressBar = document.getElementById('analysisProgress');
const modCountSpan = document.getElementById('modCount');
const modUpdateListDiv = document.getElementById('modUpdateList');
const updateAllBtn = document.getElementById('updateAllBtn');
const downloadUpdatesBtn = document.getElementById('downloadUpdatesBtn');

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

// Variables for the update feature
let uploadedMods = [];
let detectedVersion = null;
let availableUpdates = {};
let modsToUpdate = new Set();

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

// Tab switching functionality
function initTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
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
    
    // Also populate the target version dropdown for the update tab
    targetVersionSelect.innerHTML = "<option value=''>Select Version</option>";
    stable.forEach(v => {
      let opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      targetVersionSelect.appendChild(opt);
    });
    
    statusDiv.textContent = "";
  } catch (e) {
    mcVersionSelect.innerHTML = "<option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
    targetVersionSelect.innerHTML = "<option value=''>Select Version</option><option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
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

// ==================== MOD UPDATE FEATURE ====================

// Handle folder input change
modFolderInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  
  await processModFiles(files);
});

// Handle individual files input change
modFilesInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  
  await processModFiles(files);
});

// Process the selected mod files
async function processModFiles(files) {
  // Reset state
  uploadedMods = [];
  detectedVersion = null;
  availableUpdates = {};
  modsToUpdate.clear();
  
  analysisStatusDiv.textContent = `Analyzing ${files.length} files...`;
  analysisProgressBar.value = 0;
  modUpdateListDiv.innerHTML = '';
  detectedVersionSpan.textContent = '-';
  targetVersionSelect.disabled = true;
  updateAllBtn.disabled = true;
  downloadUpdatesBtn.disabled = true;
  
  // Filter only .jar files
  const jarFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.jar'));
  
  if (jarFiles.length === 0) {
    analysisStatusDiv.textContent = "No mod files (.jar) found. Please select valid mod files.";
    return;
  }
  
  let versionCounts = {};
  let processedCount = 0;
  
  for (const file of jarFiles) {
    try {
      const modInfo = await extractModInfo(file);
      if (modInfo) {
        uploadedMods.push(modInfo);
        
        // Count versions to determine the most common one
        if (modInfo.mcVersion) {
          versionCounts[modInfo.mcVersion] = (versionCounts[modInfo.mcVersion] || 0) + 1;
        }
      }
      
      // Update progress
      processedCount++;
      const progress = (processedCount / jarFiles.length) * 100;
      analysisProgressBar.value = progress;
    } catch (e) {
      console.error(`Error processing ${file.name}:`, e);
    }
  }
  
  // Determine the most common version
  let mostCommonVersion = null;
  let maxCount = 0;
  
  Object.entries(versionCounts).forEach(([version, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonVersion = version;
    }
  });
  
  detectedVersion = mostCommonVersion;
  
  if (detectedVersion) {
    detectedVersionSpan.textContent = detectedVersion;
    targetVersionSelect.disabled = false;
    
    // Enable versions newer than detected version
    const options = Array.from(targetVersionSelect.options);
    options.forEach(option => {
      if (option.value && compareVersions(option.value, detectedVersion) > 0) {
        option.disabled = false;
      } else if (option.value) {
        option.disabled = true;
      }
    });
    
    // Select the first valid target version
    for (const option of options) {
      if (option.value && !option.disabled) {
        targetVersionSelect.value = option.value;
        break;
      }
    }
    
    // Fetch available updates for all mods
    await fetchAvailableUpdates();
  } else {
    analysisStatusDiv.textContent = "