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
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Update tab elements
const folderInput = document.getElementById('folderInput');
const fileInput = document.getElementById('fileInput');
const fileListDiv = document.getElementById('fileList');
const targetVersionSelect = document.getElementById('targetVersion');
const targetLoaderSelect = document.getElementById('targetLoader');
const analyzeBtn = document.getElementById('analyzeBtn');
const updateBtn = document.getElementById('updateBtn');
const updateResultsDiv = document.getElementById('updateResults');
const detectVersionDiv = document.getElementById('detectVersion');
const detectLoaderDiv = document.getElementById('detectLoader');
const modsCountDiv = document.getElementById('modsCount');
const updateListDiv = document.getElementById('updateList');
const updateStatusDiv = document.getElementById('updateStatus');

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

// For update tab
let selectedFiles = [];
let detectedVersion = null;
let detectedLoader = null;
let modInfoMap = new Map();

// Function to initialize tab switching
function initTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
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
    
    populateVersionDropdown(mcVersionSelect, stable);
    populateVersionDropdown(targetVersionSelect, stable);
    
    statusDiv.textContent = "";
  } catch (e) {
    mcVersionSelect.innerHTML = "<option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
    targetVersionSelect.innerHTML = "<option value=''>Select a version</option><option value='1.20.1'>1.20.1</option><option value='1.18.2'>1.18.2</option>";
    statusDiv.textContent = "Failed to load versions.";
  }
}

// Helper function to populate version dropdowns
function populateVersionDropdown(select, versions) {
  select.innerHTML = "";
  if (select === targetVersionSelect) {
    select.innerHTML = "<option value=''>Select a version</option>";
  }
  
  versions.forEach(v => {
    let opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  
  if (select === mcVersionSelect) {
    select.value = versions.find(v => v === "1.20.1") || versions[0];
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

// ----- Modpack Update Feature -----

// Handle file selection
folderInput.addEventListener('change', handleFileSelection);
fileInput.addEventListener('change', handleFileSelection);

function handleFileSelection(e) {
  selectedFiles = Array.from(e.target.files).filter(file => 
    file.name.endsWith('.jar')
  );
  
  updateFileList();
  
  if (selectedFiles.length > 0) {
    analyzeBtn.disabled = false;
    targetVersionSelect.disabled = false;
    targetLoaderSelect.disabled = false;
  } else {
    analyzeBtn.disabled = true;
    targetVersionSelect.disabled = true;
    targetLoaderSelect.disabled = true;
  }
}

// Update the file list display
function updateFileList() {
  if (!selectedFiles.length) {
    fileListDiv.innerHTML = '<p class="no-files">No files selected</p>';
    return;
  }
  
  fileListDiv.innerHTML = '';
  let totalSize = 0;
  
  selectedFiles.forEach(file => {
    totalSize += file.size;
    
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileName = document.createElement('span');
    fileName.className = 'file-name';
    fileName.textContent = file.name;
    
    const fileSize = document.createElement('span');
    fileSize.className = 'file-size';
    fileSize.textContent = formatFileSize(file.size);
    
    fileItem.appendChild(fileName);
    fileItem.appendChild(fileSize);
    fileListDiv.appendChild(fileItem);
  });
  
  // Add summary
  const summary = document.createElement('div');
  summary.className = 'file-item';
  
  const totalFiles = document.createElement('span');
  totalFiles.className = 'file-name';
  totalFiles.textContent = `Total: ${selectedFiles.length} files`;
  
  const totalSizeSpan = document.createElement('span');
  totalSizeSpan.className = 'file-size';
  totalSizeSpan.textContent = formatFileSize(totalSize);
  
  summary