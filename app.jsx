import { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// 🔥 YOUR FIREBASE CONFIG – REPLACE WITH YOUR OWN
const firebaseConfig = {
  apiKey: "AIzaSyDpZJ0uwXBbT9M6AqzRZIFa3Y4GycmyeiE",
  authDomain: "stock-manager-2c60f.firebaseapp.com",
  projectId: "stock-manager-2c60f",
  storageBucket: "stock-manager-2c60f.firebasestorage.app",
  messagingSenderId: "351828175155",
  appId: "1:351828175155:web:538514a6fd735ed19d3646",
  measurementId: "G-29MHF9TPCV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app); // optional, can remove

const CATEGORIES = ['Phones', 'Chargers', 'Docks', 'Data Cable', 'Headphones Wired', 'Headphones Wireless'];

const formatNPR = (amount) => `रू ${amount.toFixed(2)}`;

export default function App() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  // Inline add form state
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newStock, setNewStock] = useState(0);
  const [newPrice, setNewPrice] = useState('');
  const [newMinStock, setNewMinStock] = useState(5);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const stats = useMemo(() => {
    return products.reduce((acc, p) => {
      acc.value += p.price * p.stock;
      acc.items += p.stock;
      if (p.stock === 0) acc.out++;
      else if (p.stock <= p.minStock) acc.low++;
      return acc;
    }, { value: 0, items: 0, low: 0, out: 0 });
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                            (p.sku || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'All' || p.category === category;
      let matchesStatus = true;
      if (statusFilter === 'low') matchesStatus = p.stock > 0 && p.stock <= p.minStock;
      else if (statusFilter === 'out') matchesStatus = p.stock === 0;
      else if (statusFilter === 'in') matchesStatus = p.stock > p.minStock;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, category, statusFilter]);

  const handleStockAdjust = async (id, delta) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    await updateDoc(doc(db, 'products', id), { stock: newStock });
    showToast('Stock updated');
  };

  const handleAddInline = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return showToast('Product name required', 'error');
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum < 0) return showToast('Invalid price', 'error');
    if (isNaN(newStock) || newStock < 0) return showToast('Invalid stock', 'error');
    const data = {
      name: newName.trim(),
      sku: newSku.trim() || `SKU-${Math.random().toString(36).substring(2,7).toUpperCase()}`,
      category: newCategory,
      price: priceNum,
      stock: parseInt(newStock),
      minStock: parseInt(newMinStock) || 5
    };
    await addDoc(collection(db, 'products'), data);
    showToast('Product added');
    setNewSku('');
    setNewName('');
    setNewCategory(CATEGORIES[0]);
    setNewStock(0);
    setNewPrice('');
    setNewMinStock(5);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      name: form.name.value.trim(),
      sku: form.sku.value.trim(),
      category: form.category.value,
      price: parseFloat(form.price.value),
      stock: parseInt(form.stock.value),
      minStock: parseInt(form.minStock.value) || 5
    };
    if (!data.name) return showToast('Product name required', 'error');
    if (isNaN(data.price) || data.price < 0) return showToast('Invalid price', 'error');
    if (isNaN(data.stock) || data.stock < 0) return showToast('Invalid stock', 'error');
    if (editingProduct) {
      await updateDoc(doc(db, 'products', editingProduct.id), data);
      showToast('Product updated');
    } else {
      await addDoc(collection(db, 'products'), data);
      showToast('Product added');
    }
    setModalOpen(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = async (id) => {
    await deleteDoc(doc(db, 'products', id));
    showToast('Product deleted', 'warning');
    setDeleteConfirmId(null);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] p-6">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md shadow-md text-sm ${
          toast.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
          toast.type === 'warning' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
          'bg-zinc-900 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">stocks</h1>
          <p className="text-sm text-zinc-500">Inventory</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <p className="text-xs text-zinc-500 uppercase">Total Value</p>
            <p className="text-2xl font-bold">{formatNPR(stats.value)}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <p className="text-xs text-zinc-500 uppercase">Total Units</p>
            <p className="text-2xl font-bold">{stats.items.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <p className="text-xs text-zinc-500 uppercase">Alerts</p>
            <p className="text-2xl font-bold">{stats.low + stats.out}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white"
          >
            <option>All</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white"
          >
            <option value="All">All Status</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          <button
            onClick={() => { setSearch(''); setCategory('All'); setStatusFilter('All'); }}
            className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-md text-sm transition"
          >
            Clear
          </button>
        </div>

        {/* Inline Add Row */}
        <form onSubmit={handleAddInline} className="bg-white p-3 rounded-lg border shadow-sm mb-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-zinc-500 mb-1">SKU</label>
            <input type="text" value={newSku} onChange={e => setNewSku(e.target.value)} placeholder="Auto" className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-zinc-500 mb-1">Product Name *</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div className="w-32">
            <label className="block text-xs text-zinc-500 mb-1">Category</label>
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-2 py-1 border rounded text-sm bg-white">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-xs text-zinc-500 mb-1">Stock</label>
            <input type="number" value={newStock} onChange={e => setNewStock(parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div className="w-28">
            <label className="block text-xs text-zinc-500 mb-1">Price (NPR)</label>
            <input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <div className="w-24">
            <label className="block text-xs text-zinc-500 mb-1">Alert Level</label>
            <input type="number" value={newMinStock} onChange={e => setNewMinStock(parseInt(e.target.value) || 5)} className="w-full px-2 py-1 border rounded text-sm" />
          </div>
          <button type="submit" className="px-4 py-1 bg-zinc-900 text-white rounded-md text-sm h-9">+ Add</button>
        </form>

        {/* Product Table */}
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 border-b">
              <tr>
                {['SKU', 'Product', 'Category', 'Price (NPR)', 'Stock', 'Status', 'Value (NPR)', 'Actions'].map(h => (
                  <th key={h} className="p-3 text-xs font-semibold text-zinc-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-zinc-400">No products found</td></tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-50/50">
                    <td className="p-3 font-mono text-xs">{p.sku || p.id.slice(0,6)}</td>
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{p.category}</td>
                    <td className="p-3">{formatNPR(p.price)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleStockAdjust(p.id, -1)} disabled={p.stock === 0} className="w-6 h-6 rounded border border-zinc-200 hover:bg-zinc-100 disabled:opacity-40">-</button>
                        <span className="w-8 text-center font-medium">{p.stock}</span>
                        <button onClick={() => handleStockAdjust(p.id, 1)} className="w-6 h-6 rounded border border-zinc-200 hover:bg-zinc-100">+</button>
                      </div>
                    </td>
                    <td className="p-3">
                      {p.stock === 0 ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Out</span> :
                       p.stock <= p.minStock ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">Low</span> :
                       <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs">In</span>}
                    </td>
                    <td className="p-3 font-medium">{formatNPR(p.price * p.stock)}</td>
                    <td className="p-3">
                      {deleteConfirmId === p.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => handleDeleteProduct(p.id)} className="bg-red-600 text-white px-2 py-0.5 rounded text-xs">Yes</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="bg-zinc-200 px-2 py-0.5 rounded text-xs">No</button>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <button onClick={() => { setEditingProduct(p); setModalOpen(true); }} className="text-blue-600 hover:text-blue-800">Edit</button>
                          <button onClick={() => setDeleteConfirmId(p.id)} className="text-red-600 hover:text-red-800">Del</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h2 className="text-xl font-semibold mb-4">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
            <form onSubmit={handleSaveProduct}>
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input name="name" defaultValue={editingProduct?.name || ''} required className="w-full border rounded-md p-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-sm mb-1">SKU</label><input name="sku" defaultValue={editingProduct?.sku || ''} className="w-full border rounded-md p-2 text-sm" /></div>
                <div><label className="block text-sm mb-1">Category</label><select name="category" defaultValue={editingProduct?.category || CATEGORIES[0]} className="w-full border rounded-md p-2 text-sm">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div><label className="block text-sm mb-1">Price (NPR)</label><input name="price" type="number" step="0.01" defaultValue={editingProduct?.price || ''} required className="w-full border rounded-md p-2 text-sm" /></div>
                <div><label className="block text-sm mb-1">Stock</label><input name="stock" type="number" defaultValue={editingProduct?.stock ?? 0} required className="w-full border rounded-md p-2 text-sm" /></div>
                <div><label className="block text-sm mb-1">Alert Level</label><input name="minStock" type="number" defaultValue={editingProduct?.minStock ?? 5} className="w-full border rounded-md p-2 text-sm" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setModalOpen(false); setEditingProduct(null); }} className="px-4 py-2 border rounded-md text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-zinc-900 text-white rounded-md text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}