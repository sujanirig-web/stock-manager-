import { db } from './firebase.js';
import { showToast, formatNPR, escapeHtml, generateSku } from './helpers.js';
import { 
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, 
  query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---------- Global State ----------
let products = [];
let searchQuery = '';
let selectedCategory = 'All';
let statusFilter = 'All';
let deleteConfirmId = null;

const CATEGORIES = ['Phones', 'Chargers', 'Docks', 'Data Cable', 'Headphones Wired', 'Headphones Wireless'];
const productsRef = collection(db, "products");

// ---------- CRUD Operations ----------
async function addProduct(data) {
  try {
    await addDoc(productsRef, data);
    showToast("Product added");
  } catch (err) {
    showToast("Error adding product", "error");
  }
}

async function updateProduct(id, data) {
  try {
    await updateDoc(doc(db, "products", id), data);
    showToast("Product updated");
  } catch (err) {
    showToast("Error updating product", "error");
  }
}

async function updateStock(id, newStock) {
  try {
    await updateDoc(doc(db, "products", id), { stock: newStock });
    showToast("Stock updated");
  } catch (err) {
    showToast("Error updating stock", "error");
  }
}

async function deleteProduct(id) {
  try {
    await deleteDoc(doc(db, "products", id));
    showToast("Product deleted", "warning");
    deleteConfirmId = null;
    render(); // re‑render to close confirm dialog
  } catch (err) {
    showToast("Error deleting product", "error");
  }
}

// ---------- Rendering (pure DOM, no React) ----------
function render() {
  // 1. Filter products
  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (p.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
    let matchStatus = true;
    if (statusFilter === 'low') matchStatus = p.stock > 0 && p.stock <= p.minStock;
    else if (statusFilter === 'out') matchStatus = p.stock === 0;
    else if (statusFilter === 'in') matchStatus = p.stock > p.minStock;
    return matchSearch && matchCat && matchStatus;
  });

  // 2. Compute stats
  const stats = products.reduce((acc, p) => {
    acc.value += p.price * p.stock;
    acc.items += p.stock;
    if (p.stock === 0) acc.out++;
    else if (p.stock <= p.minStock) acc.low++;
    return acc;
  }, { value: 0, items: 0, low: 0, out: 0 });
  const alertCount = stats.low + stats.out;

  // 3. Build HTML string (same as before but using helper functions)
  const appDiv = document.getElementById('app');
  if (!appDiv) return;

  appDiv.innerHTML = `
    <div class="max-w-7xl mx-auto p-6">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-zinc-900">stocks</h1>
        <p class="text-sm text-zinc-500">Inventory</p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white p-4 rounded-lg border shadow-sm"><p class="text-xs text-zinc-500 uppercase">Total Value</p><p class="text-2xl font-bold">${formatNPR(stats.value)}</p></div>
        <div class="bg-white p-4 rounded-lg border shadow-sm"><p class="text-xs text-zinc-500 uppercase">Total Units</p><p class="text-2xl font-bold">${stats.items.toLocaleString()}</p></div>
        <div class="bg-white p-4 rounded-lg border shadow-sm"><p class="text-xs text-zinc-500 uppercase">Alerts</p><p class="text-2xl font-bold">${alertCount}</p></div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-3 mb-4">
        <input type="text" id="searchInput" placeholder="Search by name or SKU..." value="${escapeHtml(searchQuery)}" class="flex-1 px-3 py-2 border rounded-md text-sm">
        <select id="categorySelect" class="px-3 py-2 border rounded-md text-sm bg-white">${['All', ...CATEGORIES].map(c => `<option ${selectedCategory === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <select id="statusSelect" class="px-3 py-2 border rounded-md text-sm bg-white">
          <option value="All" ${statusFilter === 'All' ? 'selected' : ''}>All Status</option>
          <option value="in" ${statusFilter === 'in' ? 'selected' : ''}>In Stock</option>
          <option value="low" ${statusFilter === 'low' ? 'selected' : ''}>Low Stock</option>
          <option value="out" ${statusFilter === 'out' ? 'selected' : ''}>Out of Stock</option>
        </select>
        <button id="clearFilters" class="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-md text-sm">Clear</button>
      </div>

      <!-- Inline Add Row -->
      <form id="inlineAddForm" class="bg-white p-3 rounded-lg border shadow-sm mb-4 flex flex-wrap gap-2 items-end">
        <div class="flex-1 min-w-[100px]"><label class="block text-xs text-zinc-500 mb-1">SKU</label><input type="text" id="newSku" placeholder="Auto" class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="flex-1 min-w-[140px]"><label class="block text-xs text-zinc-500 mb-1">Product Name *</label><input type="text" id="newName" required class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="w-32"><label class="block text-xs text-zinc-500 mb-1">Category</label><select id="newCategory" class="w-full px-2 py-1 border rounded text-sm bg-white">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="w-24"><label class="block text-xs text-zinc-500 mb-1">Stock</label><input type="number" id="newStock" value="0" class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="w-28"><label class="block text-xs text-zinc-500 mb-1">Price (NPR)</label><input type="number" step="0.01" id="newPrice" class="w-full px-2 py-1 border rounded text-sm"></div>
        <div class="w-24"><label class="block text-xs text-zinc-500 mb-1">Alert</label><input type="number" id="newMinStock" value="5" class="w-full px-2 py-1 border rounded text-sm"></div>
        <button type="submit" class="px-4 py-1 bg-zinc-900 text-white rounded-md text-sm h-9">+ Add</button>
      </form>

      <!-- Product Table -->
      <div class="bg-white rounded-lg border shadow-sm overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-zinc-50 border-b"><tr>${['SKU', 'Product', 'Category', 'Price (NPR)', 'Stock', 'Status', 'Value', 'Actions'].map(h => `<th class="p-3 text-xs font-semibold text-zinc-500 uppercase">${h}</th>`).join('')}?</thead>
          <tbody class="divide-y">
            ${filtered.map(p => `
              <tr class="hover:bg-zinc-50/50">
                <td class="p-3 font-mono text-xs">${escapeHtml(p.sku || p.id.slice(0,6))}</td>
                <td class="p-3 font-medium">${escapeHtml(p.name)}</td>
                <td class="p-3">${p.category}</td>
                <td class="p-3">${formatNPR(p.price)}</td>
                <td class="p-3"><div class="flex items-center gap-2"><button class="decr w-6 h-6 border rounded hover:bg-zinc-100" data-id="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>-</button><span class="w-8 text-center">${p.stock}</span><button class="incr w-6 h-6 border rounded hover:bg-zinc-100" data-id="${p.id}">+</button></div></td>
                <td class="p-3">${p.stock === 0 ? '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Out</span>' : p.stock <= p.minStock ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">Low</span>' : '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs">In</span>'}</td>
                <td class="p-3 font-medium">${formatNPR(p.price * p.stock)}</td>
                <td class="p-3">
                  ${deleteConfirmId === p.id ? 
                    `<div class="flex gap-2"><button class="confirm-del bg-red-600 text-white px-2 py-0.5 rounded text-xs" data-id="${p.id}">Yes</button><button class="cancel-del bg-zinc-200 px-2 py-0.5 rounded text-xs">No</button></div>` :
                    `<div class="flex gap-3"><button class="edit-product text-blue-600" data-id="${p.id}">Edit</button><button class="delete-product text-red-600" data-id="${p.id}">Del</button></div>`
                  }
                </td>
              </tr>
            `).join('')}
            ${filtered.length === 0 ? `<tr><td colspan="8" class="p-8 text-center text-zinc-400">No products found</td>` : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal -->
    <div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50 hidden">
      <div class="bg-white rounded-lg w-full max-w-md p-6">
        <h2 id="modalTitle" class="text-xl font-semibold mb-4">Edit Product</h2>
        <form id="editForm">
          <input type="hidden" id="editId">
          <div class="mb-3"><label class="block text-sm font-medium mb-1">Name *</label><input id="editName" required class="w-full border rounded-md p-2 text-sm"></div>
          <div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-sm mb-1">SKU</label><input id="editSku" class="w-full border rounded-md p-2 text-sm"></div><div><label class="block text-sm mb-1">Category</label><select id="editCategory" class="w-full border rounded-md p-2 text-sm">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div></div>
          <div class="grid grid-cols-3 gap-3 mb-4"><div><label class="block text-sm mb-1">Price (NPR)</label><input id="editPrice" type="number" step="0.01" required class="w-full border rounded-md p-2 text-sm"></div><div><label class="block text-sm mb-1">Stock</label><input id="editStock" type="number" required class="w-full border rounded-md p-2 text-sm"></div><div><label class="block text-sm mb-1">Alert Level</label><input id="editMinStock" type="number" class="w-full border rounded-md p-2 text-sm"></div></div>
          <div class="flex justify-end gap-2"><button type="button" id="closeModalBtn" class="px-4 py-2 border rounded-md text-sm">Cancel</button><button type="submit" class="px-4 py-2 bg-zinc-900 text-white rounded-md text-sm">Save</button></div>
        </form>
      </div>
    </div>
  `;

  // Re-attach event listeners after DOM update
  attachEventListeners();
}

// ---------- Event Listeners (delegation + direct) ----------
function attachEventListeners() {
  // Filters
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const statusSelect = document.getElementById('statusSelect');
  const clearBtn = document.getElementById('clearFilters');
  if (searchInput) searchInput.addEventListener('input', e => { searchQuery = e.target.value; render(); });
  if (categorySelect) categorySelect.addEventListener('change', e => { selectedCategory = e.target.value; render(); });
  if (statusSelect) statusSelect.addEventListener('change', e => { statusFilter = e.target.value; render(); });
  if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; selectedCategory = 'All'; statusFilter = 'All'; render(); });

  // Inline add form
  const addForm = document.getElementById('inlineAddForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newName').value.trim();
      if (!name) return showToast('Product name required', 'error');
      const price = parseFloat(document.getElementById('newPrice').value);
      const stock = parseInt(document.getElementById('newStock').value);
      if (isNaN(price) || price < 0) return showToast('Invalid price', 'error');
      if (isNaN(stock) || stock < 0) return showToast('Invalid stock', 'error');
      const data = {
        name,
        sku: document.getElementById('newSku').value.trim() || generateSku(),
        category: document.getElementById('newCategory').value,
        price,
        stock,
        minStock: parseInt(document.getElementById('newMinStock').value) || 5
      };
      await addProduct(data);
      // Reset form
      document.getElementById('newSku').value = '';
      document.getElementById('newName').value = '';
      document.getElementById('newStock').value = '0';
      document.getElementById('newPrice').value = '';
      document.getElementById('newMinStock').value = '5';
    });
  }

  // Stock buttons (event delegation using document)
  document.querySelectorAll('.incr').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    const prod = products.find(p => p.id === id);
    if (prod) await updateStock(id, prod.stock + 1);
  }));
  document.querySelectorAll('.decr').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    const prod = products.find(p => p.id === id);
    if (prod && prod.stock > 0) await updateStock(id, prod.stock - 1);
  }));

  // Edit / Delete buttons
  document.querySelectorAll('.edit-product').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.id;
    const prod = products.find(p => p.id === id);
    if (prod) openEditModal(prod);
  }));
  document.querySelectorAll('.delete-product').forEach(btn => btn.addEventListener('click', () => {
    deleteConfirmId = btn.dataset.id;
    render();
  }));
  document.querySelectorAll('.confirm-del').forEach(btn => btn.addEventListener('click', async () => {
    await deleteProduct(btn.dataset.id);
    deleteConfirmId = null;
    render();
  }));
  document.querySelectorAll('.cancel-del').forEach(btn => btn.addEventListener('click', () => {
    deleteConfirmId = null;
    render();
  }));

  // Modal controls
  const modal = document.getElementById('editModal');
  const closeModal = () => modal.classList.add('hidden');
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  document.getElementById('editForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const data = {
      name: document.getElementById('editName').value.trim(),
      sku: document.getElementById('editSku').value.trim(),
      category: document.getElementById('editCategory').value,
      price: parseFloat(document.getElementById('editPrice').value),
      stock: parseInt(document.getElementById('editStock').value),
      minStock: parseInt(document.getElementById('editMinStock').value) || 5
    };
    if (!data.name) return showToast('Name required', 'error');
    if (isNaN(data.price) || data.price < 0) return showToast('Invalid price', 'error');
    if (isNaN(data.stock) || data.stock < 0) return showToast('Invalid stock', 'error');
    await updateProduct(id, data);
    modal.classList.add('hidden');
  });
}

function openEditModal(product) {
  const modal = document.getElementById('editModal');
  document.getElementById('editId').value = product.id;
  document.getElementById('editName').value = product.name;
  document.getElementById('editSku').value = product.sku || '';
  document.getElementById('editCategory').value = product.category;
  document.getElementById('editPrice').value = product.price;
  document.getElementById('editStock').value = product.stock;
  document.getElementById('editMinStock').value = product.minStock || 5;
  modal.classList.remove('hidden');
}

// ---------- Firestore Real‑time Listener ----------
const q = query(productsRef, orderBy('name'));
onSnapshot(q, (snapshot) => {
  products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  render();
});