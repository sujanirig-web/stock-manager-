import { db } from './firebase.js';
import { showToast, formatNPR, escapeHtml, generateSku } from './helper.js';
import { 
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, 
  getDocs, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


let products = [];
let categories = [];
let searchQuery = '';
let selectedCategory = 'All';
let statusFilter = 'All';
let deleteConfirmId = null;
let statsMode = 'all';
let skuTouched = false;
let categoryTouched = false;

const productsRef = collection(db, "products");
const categoriesRef = collection(db, "categories");

const DEFAULT_MIN_STOCK = 5;
const UNASSIGNED_CATEGORY = 'Uncategorized';


const DEFAULT_CATEGORIES = [
  'Smartphones (New)', 'Smartphones (Used/Refurbished)', 'Feature Phones',
  'Earphones (Wired)', 'Earphones (Wireless/TWS)', 'Headphones (Wired)', 'Headphones (Wireless)',
  'Bluetooth Speakers', 'Chargers (Fast Charging)', 'Chargers (Standard)', 'Power Banks',
  'Wireless Chargers', 'Car Chargers', 'USB Cables (Type-C)', 'USB Cables (Micro-USB)',
  'USB Cables (Lightning)', 'USB Hubs & Adapters', 'Screen Protectors (Tempered Glass)',
  'Screen Protectors (Plastic)', 'Back Covers (Silicone)', 'Back Covers (Hard/TPU)',
  'Camera Lens Protectors', 'Phone Cases (Premium)', 'Phone Cases (Budget)', 'Pouches & Sleeves',
  'Smartwatches', 'Fitness Bands', 'Smart Rings', 'Selfie Sticks', 'Tripods (Mobile)',
  'Gimbals (Stabilizers)', 'Pop Sockets & Grips', 'Phone Holders (Car/Bike)',
  'Memory Cards (MicroSD)', 'OTG Drives', 'Replacement Batteries', 'Replacement Screens',
  'Repair Tools', 'Adhesives & Glue', 'Cleaning Kits', 'Phone Stands', 'VR Headsets',
  'Mobile Gaming Controllers'
];


function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}


function parseCount(value, fallback = 0) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}


function sanitizeCount(value, fallback = DEFAULT_MIN_STOCK) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num;
}


function normalizeProduct(data, id) {
  return {
    ...data,
    id,
    name: data?.name == null ? '' : String(data.name),
    sku: data?.sku == null ? '' : String(data.sku),
    category: data?.category ? String(data.category) : UNASSIGNED_CATEGORY,
    price: Math.max(0, toNumber(data?.price, 0)),
    stock: Math.max(0, Math.trunc(toNumber(data?.stock, 0))),
    minStock: Math.max(0, Math.trunc(toNumber(data?.minStock, DEFAULT_MIN_STOCK)))
  };
}


function normalizeCategory(data, id) {
  return {
    ...data,
    id,
    name: data?.name == null ? '' : String(data.name),
    order: toNumber(data?.order, Number.MAX_SAFE_INTEGER)
  };
}


async function seedDefaultCategories() {
  try {
    const snapshot = await getDocs(categoriesRef);
    if (!snapshot.empty) return;
    const batch = writeBatch(db);
    DEFAULT_CATEGORIES.forEach((name, i) => {
      batch.set(doc(categoriesRef), { name, order: i });
    });
    await batch.commit();
    showToast("Default categories added", "info");
  } catch (err) {
    console.error(err);
    showToast("Error seeding categories", "error");
  }
}


async function addProduct(data) {
  try {
    await addDoc(productsRef, data);
    showToast("Product added");
    return true;
  } catch (err) {
    console.error(err);
    showToast("Error adding product", "error");
    return false;
  }
}


async function updateProduct(id, data) {
  try {
    await updateDoc(doc(db, "products", id), data);
    showToast("Product updated");
    return true;
  } catch (err) {
    console.error(err);
    showToast("Error updating product", "error");
    return false;
  }
}


async function updateStock(id, delta) {
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "products", id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Product not found');
      const current = Math.max(0, Math.trunc(toNumber(snap.data()?.stock, 0)));
      const next = Math.max(0, current + delta);
      if (next === current) return;
      tx.update(ref, { stock: next });
    });
  } catch (err) {
    console.error(err);
    showToast("Error updating stock", "error");
  }
}


async function deleteProduct(id) {
  try {
    await deleteDoc(doc(db, "products", id));
    showToast("Product deleted", "warning");
  } catch (err) {
    console.error(err);
    showToast("Error deleting product", "error");
  }
  if (deleteConfirmId === id) deleteConfirmId = null;
  renderTable();
}


function isCategoryNameTaken(name, exceptId = null) {
  const target = name.trim().toLowerCase();
  return categories.some(c => c.id !== exceptId && c.name.trim().toLowerCase() === target);
}


async function addCategory(name) {
  const clean = name.trim();
  if (!clean) return showToast("Category name required", "error");
  if (isCategoryNameTaken(clean)) return showToast("Category already exists", "error");
  try {
    const nextOrder = categories.reduce((max, c) => Math.max(max, toNumber(c.order, 0)), -1) + 1;
    await addDoc(categoriesRef, { name: clean, order: nextOrder });
    showToast("Category added");
  } catch (err) {
    console.error(err);
    showToast("Error adding category", "error");
  }
}


async function updateCategory(id, newName) {
  const clean = newName.trim();
  if (!clean) return showToast("Name required", "error");
  const catName = categories.find(c => c.id === id)?.name;
  if (isCategoryNameTaken(clean, id)) return showToast("Category already exists", "error");
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "categories", id), { name: clean });
    const affected = catName && catName !== clean ? products.filter(p => p.category === catName) : [];
    affected.forEach(p => batch.update(doc(db, "products", p.id), { category: clean }));
    await batch.commit();
    if (catName && selectedCategory === catName) selectedCategory = clean;
    showToast(affected.length ? `Category renamed, ${affected.length} product(s) updated` : "Category updated");
  } catch (err) {
    console.error(err);
    showToast("Error updating category", "error");
  }
}


async function deleteCategory(id) {
  if (categories.length <= 1) return showToast("Cannot delete: at least one category is required", "error");
  const catName = categories.find(c => c.id === id)?.name;
  const used = products.some(p => p.category === catName);
  if (used) return showToast("Cannot delete: category used by products", "error");
  try {
    await deleteDoc(doc(db, "categories", id));
    if (selectedCategory === catName) selectedCategory = 'All';
    showToast("Category deleted", "warning");
    renderData();
  } catch (err) {
    console.error(err);
    showToast("Error deleting category", "error");
  }
}


function computeStats(productList) {
  return productList.reduce((acc, p) => {
    acc.value += p.price * p.stock;
    acc.items += p.stock;
    if (p.stock === 0) acc.out++;
    else if (p.stock <= p.minStock) acc.low++;
    return acc;
  }, { value: 0, items: 0, low: 0, out: 0 });
}


function stockStatus(p) {
  if (p.stock === 0) return 'out';
  if (p.stock <= p.minStock) return 'low';
  return 'in';
}


function generateSmartSKU(name, excludeId = null) {
  const clean = name.trim();
  if (!clean) return '';
  const parts = clean.split(/\s+/).slice(0, 2).map(word => {
    const digits = word.match(/\d+/);
    if (digits) return digits[0];
    return word.length >= 2 ? word.substring(0, 2) : word;
  }).filter(Boolean).map(part => part.toUpperCase());
  const base = parts.join('-') || generateSku();
  const taken = new Set(products.filter(p => p.id !== excludeId).map(p => p.sku.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`.toLowerCase())) suffix++;
  return `${base}-${suffix}`;
}


const WORD_ALIASES = { keypad: 'feature' };


const WEAK_ALIASES = {
  phone: 'smartphone', mobile: 'smartphone', watch: 'smartwatch', wristwatch: 'smartwatch',
  iphone: 'smartphone', ipad: 'tablet', samsung: 'smartphone', galaxy: 'smartphone',
  xiaomi: 'smartphone', redmi: 'smartphone', realme: 'smartphone', oppo: 'smartphone',
  vivo: 'smartphone', oneplus: 'smartphone', nokia: 'smartphone', tecno: 'smartphone',
  itel: 'smartphone', infinix: 'smartphone', honor: 'smartphone', moto: 'smartphone',
  motorola: 'smartphone', meizu: 'smartphone', walton: 'smartphone', lava: 'smartphone',
  gionee: 'smartphone', micromax: 'smartphone', alcatel: 'smartphone', zte: 'smartphone',
  asus: 'smartphone', htc: 'smartphone', nothing: 'smartphone', pixel: 'smartphone',
  cheap: 'budget', clear: 'budget', transparent: 'budget', plain: 'budget',
  basic: 'budget', simple: 'budget', leather: 'premium', luxury: 'premium',
  carbon: 'premium', armor: 'premium', rugged: 'premium'
};


const singular = word => {
  if (word.length <= 3 || !word.endsWith('s') || word.endsWith('ss')) return word;
  if (/(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  return word.slice(0, -1);
};


const stem = word => {
  const single = singular(word);
  return WORD_ALIASES[single] || WEAK_ALIASES[single] || single;
};


const categoryTokens = cat => (cat.name.toLowerCase().match(/[a-z0-9]+/g) || []).map(stem);


// 2 = same word (or plural), 1 = same beginning (charging/chargers), 0 = unrelated
function matchStrength(a, b) {
  if (a === b) return 2;
  const limit = Math.min(a.length, b.length);
  let shared = 0;
  while (shared < limit && a[shared] === b[shared]) shared++;
  return shared >= 5 ? 1 : 0;
}


function suggestCategory(name) {
  const words = [...new Set((name.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2))];
  if (!words.length) return '';
  const best = { hit: 0, weight: 0, tokens: Infinity, name: '' };
  categories.forEach(cat => {
    const tokens = [...new Set(categoryTokens(cat))].filter(t => t.length > 2);
    let hit = 0;
    let weight = 0;
    words.forEach(word => {
      const token = stem(word);
      let strongest = 0;
      tokens.forEach(t => {
        const strength = matchStrength(token, t);
        if (strength) strongest = Math.max(strongest, t.length * strength);
      });
      if (!strongest) return;
      hit++;
      weight += WEAK_ALIASES[word] ? strongest / 2 : strongest;
    });
    if (hit < best.hit) return;
    if (hit > best.hit || weight > best.weight || (hit === best.hit && weight === best.weight && tokens.length < best.tokens)) {
      best.hit = hit;
      best.weight = weight;
      best.tokens = tokens.length;
      best.name = cat.name;
    }
  });
  return best.hit > 0 ? best.name : '';
}


function categoryNames() {
  const names = new Set(categories.map(c => c.name).filter(Boolean));
  products.forEach(p => { if (p.category) names.add(p.category); });
  return [...names].sort((a, b) => a.localeCompare(b));
}


function optionsHtml(names) {
  return names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
}


function render() {
  const appDiv = document.getElementById('app');
  if (!appDiv) return;

  appDiv.innerHTML = `
    <div class="max-w-7xl mx-auto p-6">
      <div class="mb-6" id="headerAdminTrigger" style="cursor: pointer;">
        <h1 class="text-2xl font-bold text-zinc-900">stocks</h1>
        <p class="text-sm text-zinc-500">Inventory (double‑click header to manage categories)</p>
      </div>

      <div class="relative mb-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="statsRegion"></div>
        <div class="absolute top-2 right-2">
          <button id="toggleStatsMode" class="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-md hover:shadow-lg transition-all duration-200">
            <span class="text-sm font-medium text-zinc-700" id="statsModeLabel">All Products</span>
            <svg id="statsToggleIcon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 transition-transform duration-200">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-3 mb-4">
        <input type="text" id="searchInput" placeholder="Search by name or SKU..." value="${escapeHtml(searchQuery)}" class="flex-1 px-3 py-2 border rounded-md text-sm">
        <select id="categorySelect" class="px-3 py-2 border rounded-md text-sm bg-white">
          <option value="All" ${selectedCategory === 'All' ? 'selected' : ''}>All Categories</option>
        </select>
        <select id="statusSelect" class="px-3 py-2 border rounded-md text-sm bg-white">
          <option value="All" ${statusFilter === 'All' ? 'selected' : ''}>All Status</option>
          <option value="in" ${statusFilter === 'in' ? 'selected' : ''}>In Stock</option>
          <option value="low" ${statusFilter === 'low' ? 'selected' : ''}>Low Stock</option>
          <option value="out" ${statusFilter === 'out' ? 'selected' : ''}>Out of Stock</option>
        </select>
        <button id="clearFilters" class="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-md text-sm">Clear</button>
      </div>

      <form id="inlineAddForm" class="bg-white p-3 rounded-lg border shadow-sm mb-4 flex flex-wrap gap-2 items-end">
        <div class="flex-1 min-w-[100px]"><label class="block text-xs text-zinc-500 mb-1">SKU</label><input type="text" id="newSku" placeholder="Auto" class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="flex-1 min-w-[140px]"><label class="block text-xs text-zinc-500 mb-1">Product Name *</label><input type="text" id="newName" required class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="w-32"><label class="block text-xs text-zinc-500 mb-1">Category</label><select id="newCategory" class="w-full px-2 py-1 border rounded text-sm bg-white"></select></div>
        <div class="w-24"><label class="block text-xs text-zinc-500 mb-1">Stock</label><input type="number" min="0" step="1" id="newStock" value="0" class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="w-28"><label class="block text-xs text-zinc-500 mb-1">Price (NPR)</label><input type="number" min="0" step="0.01" id="newPrice" class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="w-24"><label class="block text-xs text-zinc-500 mb-1">Alert</label><input type="number" min="0" step="1" id="newMinStock" value="${DEFAULT_MIN_STOCK}" class="w-full px-2 py-1 border rounded text-sm"></div>
        <button type="submit" class="px-4 py-1 bg-zinc-900 text-white rounded-md text-sm h-9">+ Add</button>
      </form>

      <div class="bg-white rounded-lg border shadow-sm overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-zinc-50 border-b"><tr>${['SKU', 'Product', 'Category', 'Price (NPR)', 'Stock', 'Status', 'Value', 'Actions'].map(h => `<th class="p-3 text-xs font-semibold text-zinc-500 uppercase">${h}</th>`).join('')}</tr></thead>
          <tbody id="tableBody" class="divide-y"></tbody>
        </table>
      </div>
    </div>

    <div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50 hidden">
      <div class="bg-white rounded-lg w-full max-w-md p-6">
        <h2 class="text-xl font-semibold mb-4">Edit Product</h2>
        <form id="editForm">
          <input type="hidden" id="editId">
          <div class="mb-3"><label class="block text-sm font-medium mb-1">Name *</label><input id="editName" required class="w-full border rounded-md p-2 text-sm"></div>
          <div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-sm mb-1">SKU</label><input id="editSku" class="w-full border rounded-md p-2 text-sm"></div><div><label class="block text-sm mb-1">Category</label><select id="editCategory" class="w-full border rounded-md p-2 text-sm"></select></div></div>
          <div class="grid grid-cols-3 gap-3 mb-4"><div><label class="block text-sm mb-1">Price (NPR)</label><input id="editPrice" type="number" min="0" step="0.01" required class="w-full border rounded-md p-2 text-sm"></div><div><label class="block text-sm mb-1">Stock</label><input id="editStock" type="number" min="0" step="1" required class="w-full border rounded-md p-2 text-sm"></div><div><label class="block text-sm mb-1">Alert Level</label><input id="editMinStock" type="number" min="0" step="1" class="w-full border rounded-md p-2 text-sm"></div></div>
          <div class="flex justify-end gap-2"><button type="button" id="closeModalBtn" class="px-4 py-2 border rounded-md text-sm">Cancel</button><button type="submit" class="px-4 py-2 bg-zinc-900 text-white rounded-md text-sm">Save</button></div>
        </form>
      </div>
    </div>

    <div id="categoryModal" class="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50 hidden">
      <div class="bg-white rounded-lg w-full max-w-md p-6">
        <h2 class="text-xl font-semibold mb-4">Manage Categories</h2>
        <div class="mb-4">
          <form id="addCategoryForm" class="flex gap-2">
            <input type="text" id="newCategoryName" placeholder="New category name" class="flex-1 border rounded-md p-2 text-sm">
            <button type="submit" class="px-3 py-2 bg-zinc-900 text-white rounded-md text-sm">Add</button>
          </form>
        </div>
        <div id="categoriesList" class="max-h-80 overflow-y-auto"></div>
        <div class="mt-4 flex justify-end">
          <button id="closeCategoryModal" class="px-4 py-2 border rounded-md text-sm">Close</button>
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
  renderData();
}


function statsScope() {
  return statsMode === 'category' && selectedCategory !== 'All' ? selectedCategory : null;
}


function renderStats() {
  const region = document.getElementById('statsRegion');
  if (!region) return;
  const scope = statsScope();
  const list = scope ? products.filter(p => p.category === scope) : products;
  const stats = computeStats(list);
  const statsLabel = scope ? ` (${escapeHtml(scope)})` : ' (All)';
  const alertCount = stats.low + stats.out;

  region.innerHTML = `
    <div class="bg-white p-4 rounded-lg border shadow-sm">
      <p class="text-xs text-zinc-500 uppercase">Total Value${statsLabel}</p>
      <p class="text-2xl font-bold">${formatNPR(stats.value)}</p>
    </div>
    <div class="bg-white p-4 rounded-lg border shadow-sm">
      <p class="text-xs text-zinc-500 uppercase">Total Units${statsLabel}</p>
      <p class="text-2xl font-bold">${Math.round(stats.items).toLocaleString()}</p>
    </div>
    <div class="bg-white p-4 rounded-lg border shadow-sm">
      <p class="text-xs text-zinc-500 uppercase">Alerts${statsLabel}</p>
      <p class="text-2xl font-bold">${alertCount}</p>
    </div>
  `;

  const label = document.getElementById('statsModeLabel');
  if (label) label.textContent = scope ? 'Category Only' : 'All Products';
  const icon = document.getElementById('statsToggleIcon');
  if (icon) icon.classList.toggle('rotate-180', !!scope);
}


function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  const term = searchQuery.trim().toLowerCase();
  const filtered = products.filter(p => {
    const matchSearch = !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
    const status = stockStatus(p);
    const matchStatus = statusFilter === 'All' || statusFilter === status;
    return matchSearch && matchCat && matchStatus;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-zinc-400">No products found</td></tr>`;
    return;
  }

  const badge = {
    out: '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Out</span>',
    low: '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">Low</span>',
    in: '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs">In</span>'
  };

  tbody.innerHTML = filtered.map(p => `
    <tr class="hover:bg-zinc-50/50">
      <td class="p-3 font-mono text-xs">${escapeHtml(p.sku || p.id.slice(0, 6))}</td>
      <td class="p-3 font-medium">${escapeHtml(p.name)}</td>
      <td class="p-3">${escapeHtml(p.category)}</td>
      <td class="p-3">${formatNPR(p.price)}</td>
      <td class="p-3"><div class="flex items-center gap-2"><button type="button" data-action="decr" data-id="${escapeHtml(p.id)}" class="w-6 h-6 border rounded hover:bg-zinc-100" ${p.stock === 0 ? 'disabled' : ''}>-</button><span class="w-8 text-center">${p.stock}</span><button type="button" data-action="incr" data-id="${escapeHtml(p.id)}" class="w-6 h-6 border rounded hover:bg-zinc-100">+</button></div></td>
      <td class="p-3">${badge[stockStatus(p)]}</td>
      <td class="p-3 font-medium">${formatNPR(p.price * p.stock)}</td>
      <td class="p-3">
        ${deleteConfirmId === p.id
          ? `<div class="flex gap-2"><button type="button" data-action="confirm-del" data-id="${escapeHtml(p.id)}" class="bg-red-600 text-white px-2 py-0.5 rounded text-xs">Yes</button><button type="button" data-action="cancel-del" class="bg-zinc-200 px-2 py-0.5 rounded text-xs">No</button></div>`
          : `<div class="flex gap-3"><button type="button" data-action="edit" data-id="${escapeHtml(p.id)}" class="text-blue-600">Edit</button><button type="button" data-action="ask-del" data-id="${escapeHtml(p.id)}" class="text-red-600">Del</button></div>`}
      </td>
    </tr>
  `).join('');
}


function syncCategorySelect(selectId, names, keepValue, fallback) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const sig = names.join('\u0000');
  if (select.dataset.sig !== sig) {
    select.dataset.sig = sig;
    select.innerHTML = names.length
      ? optionsHtml(names)
      : `<option value="">No categories</option>`;
  }
  const wanted = keepValue || fallback;
  if (names.includes(wanted)) {
    select.value = wanted;
  } else if (names.length) {
    select.value = fallback && names.includes(fallback) ? fallback : names[0];
  }
}


function syncCategorySelects() {
  const names = categoryNames();
  const filterSelect = document.getElementById('categorySelect');
  if (filterSelect) {
    const sig = names.join('\u0000');
    if (filterSelect.dataset.sig !== sig) {
      filterSelect.dataset.sig = sig;
      filterSelect.innerHTML = `<option value="All">All Categories</option>${optionsHtml(names)}`;
    }
    filterSelect.value = names.includes(selectedCategory) ? selectedCategory : 'All';
    if (filterSelect.value !== selectedCategory) selectedCategory = filterSelect.value;
  }
  syncCategorySelect('newCategory', names, null, names[0]);
  syncCategorySelect('editCategory', names, document.getElementById('editCategory')?.value, names[0]);
}


function renderCategoriesList() {
  const list = document.getElementById('categoriesList');
  if (!list) return;
  if (!categories.length) {
    list.innerHTML = `<p class="text-sm text-zinc-400 py-2">No categories yet</p>`;
    return;
  }
  list.innerHTML = categories.map(cat => `
    <div class="flex justify-between items-center border-b py-2">
      <span class="text-sm">${escapeHtml(cat.name)}</span>
      <div class="flex gap-2">
        <button type="button" data-action="edit-cat" data-id="${escapeHtml(cat.id)}" class="text-blue-600 text-xs">Edit</button>
        <button type="button" data-action="delete-cat" data-id="${escapeHtml(cat.id)}" class="text-red-600 text-xs">Delete</button>
      </div>
    </div>
  `).join('');
}


function renderData() {
  syncCategorySelects();
  renderStats();
  renderTable();
  renderCategoriesList();
}


function attachEventListeners() {
  document.getElementById('searchInput')?.addEventListener('input', e => {
    searchQuery = e.target.value;
    renderTable();
  });
  document.getElementById('categorySelect')?.addEventListener('change', e => {
    selectedCategory = e.target.value;
    renderStats();
    renderTable();
  });
  document.getElementById('statusSelect')?.addEventListener('change', e => {
    statusFilter = e.target.value;
    renderTable();
  });
  document.getElementById('clearFilters')?.addEventListener('click', () => {
    searchQuery = '';
    selectedCategory = 'All';
    statusFilter = 'All';
    const search = document.getElementById('searchInput');
    if (search) search.value = '';
    const status = document.getElementById('statusSelect');
    if (status) status.value = 'All';
    renderData();
  });

  const toggleBtn = document.getElementById('toggleStatsMode');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      statsMode = statsMode === 'all' ? 'category' : 'all';
      renderStats();
    });
  }

  const newNameInput = document.getElementById('newName');
  const newSkuInput = document.getElementById('newSku');
  const newCategorySelect = document.getElementById('newCategory');
  newNameInput?.addEventListener('input', () => {
    if (!skuTouched) {
      const generated = generateSmartSKU(newNameInput.value);
      if (newSkuInput) newSkuInput.value = generated;
    }
    if (!categoryTouched) {
      const suggestion = suggestCategory(newNameInput.value);
      if (suggestion && newCategorySelect) newCategorySelect.value = suggestion;
    }
  });
  newSkuInput?.addEventListener('input', () => { skuTouched = true; });
  newCategorySelect?.addEventListener('change', () => { categoryTouched = true; });

  document.getElementById('inlineAddForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newNameInput?.value.trim() || '';
    if (!name) return showToast('Product name required', 'error');
    const category = document.getElementById('newCategory')?.value || '';
    if (!category) return showToast('Add a category before adding products', 'error');

    const priceRaw = document.getElementById('newPrice').value;
    const price = Number(priceRaw);
    if (priceRaw === '' || !Number.isFinite(price) || price < 0) return showToast('Invalid price', 'error');

    const stockRaw = document.getElementById('newStock').value;
    const stock = parseCount(stockRaw, -1);
    if (stock < 0) return showToast('Invalid stock', 'error');

    const data = {
      name,
      sku: newSkuInput?.value.trim() || generateSmartSKU(name) || generateSku(),
      category,
      price,
      stock,
      minStock: sanitizeCount(document.getElementById('newMinStock').value)
    };

    const added = await addProduct(data);
    if (!added) return;
    newNameInput.value = '';
    if (newSkuInput) newSkuInput.value = '';
    document.getElementById('newStock').value = '0';
    document.getElementById('newPrice').value = '';
    document.getElementById('newMinStock').value = String(DEFAULT_MIN_STOCK);
    skuTouched = false;
    categoryTouched = false;
    if (newCategorySelect && newCategorySelect.options.length) newCategorySelect.selectedIndex = 0;
    newNameInput.focus();
  });

  const modal = document.getElementById('editModal');
  const catModal = document.getElementById('categoryModal');
  document.getElementById('closeModalBtn')?.addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('editForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const name = document.getElementById('editName').value.trim();
    const category = document.getElementById('editCategory').value;
    const price = Number(document.getElementById('editPrice').value);
    const stock = parseCount(document.getElementById('editStock').value, -1);

    if (!name) return showToast('Name required', 'error');
    if (!category) return showToast('Category required', 'error');
    if (!Number.isFinite(price) || price < 0) return showToast('Invalid price', 'error');
    if (stock < 0) return showToast('Invalid stock', 'error');

    const saved = await updateProduct(id, {
      name,
      sku: document.getElementById('editSku').value.trim(),
      category,
      price,
      stock,
      minStock: sanitizeCount(document.getElementById('editMinStock').value)
    });
    if (saved) modal.classList.add('hidden');
  });

  document.getElementById('headerAdminTrigger')?.addEventListener('dblclick', () => {
    catModal.classList.remove('hidden');
    document.getElementById('newCategoryName')?.focus();
  });
  document.getElementById('closeCategoryModal')?.addEventListener('click', () => catModal.classList.add('hidden'));
  document.getElementById('addCategoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('newCategoryName');
    await addCategory(input.value);
    input.value = '';
    input.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    modal.classList.add('hidden');
    catModal.classList.add('hidden');
  });

  document.getElementById('app')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case 'incr':
        await updateStock(id, 1);
        break;
      case 'decr':
        await updateStock(id, -1);
        break;
      case 'edit': {
        const prod = products.find(p => p.id === id);
        if (prod) openEditModal(prod);
        break;
      }
      case 'ask-del':
        deleteConfirmId = id;
        renderTable();
        break;
      case 'confirm-del':
        await deleteProduct(id);
        break;
      case 'cancel-del':
        deleteConfirmId = null;
        renderTable();
        break;
      case 'edit-cat': {
        const cat = categories.find(c => c.id === id);
        if (!cat) break;
        const newName = prompt('Edit category name:', cat.name);
        if (newName === null) break;
        await updateCategory(id, newName);
        break;
      }
      case 'delete-cat': {
        if (!confirm('Delete this category? It cannot be used by any product.')) break;
        await deleteCategory(id);
        break;
      }
    }
  });
}


function openEditModal(product) {
  const modal = document.getElementById('editModal');
  if (!modal) return;
  document.getElementById('editId').value = product.id;
  document.getElementById('editName').value = product.name;
  document.getElementById('editSku').value = product.sku || generateSmartSKU(product.name, product.id);
  document.getElementById('editPrice').value = product.price;
  document.getElementById('editStock').value = product.stock;
  document.getElementById('editMinStock').value = product.minStock;
  modal.classList.remove('hidden');
  document.getElementById('editCategory').value = product.category;
  document.getElementById('editName').focus();
}


onSnapshot(productsRef, (snapshot) => {
  products = snapshot.docs
    .map(snap => normalizeProduct(snap.data(), snap.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (deleteConfirmId && !products.some(p => p.id === deleteConfirmId)) deleteConfirmId = null;
  renderData();
});

onSnapshot(categoriesRef, (snapshot) => {
  categories = snapshot.docs
    .map(snap => normalizeCategory(snap.data(), snap.id))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  renderData();
});


render();

seedDefaultCategories();