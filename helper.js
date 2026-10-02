
let toastTimeout;

export function showToast(message, type = "success") {
  const toastEl = document.getElementById("toast");
  if (!toastEl) return;
  clearTimeout(toastTimeout);
  toastEl.innerHTML = `<div class="px-4 py-3 rounded-md shadow-md border text-sm ${
    type === "error" ? "bg-red-100 text-red-800 border-red-200" :
    type === "warning" ? "bg-amber-100 text-amber-800 border-amber-200" :
    "bg-zinc-900 text-white"
  }">${escapeHtml(message)}</div>`;
  toastEl.classList.remove("hidden");
  toastEl.classList.remove("toast-show");
  void toastEl.offsetWidth;
  toastEl.classList.add("toast-show");
  toastTimeout = setTimeout(() => {
    toastEl.classList.add("hidden");
    toastEl.classList.remove("toast-show");
    toastEl.innerHTML = "";
  }, 3000);
}


export function formatNPR(amount) {
  const num = Number(amount);
  return `रू ${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
}


export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    return '&#39;';
  });
}


export function generateSku() {
  return `SKU-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}