
let toastTimeout;

export function showToast(message, type = "success") {
  const toastEl = document.getElementById("toast");
  if (!toastEl) return;
  clearTimeout(toastTimeout);
  toastEl.innerHTML = `<div class="px-4 py-3 rounded-md shadow-md border text-sm ${
    type === "error" ? "bg-red-100 text-red-800 border-red-200" :
    type === "warning" ? "bg-amber-100 text-amber-800 border-amber-200" :
    "bg-zinc-900 text-white"
  }">${message}</div>`;
  toastEl.classList.remove("hidden");
  toastEl.classList.add("toast-show");
  toastTimeout = setTimeout(() => {
    toastEl.classList.add("hidden");
    toastEl.innerHTML = "";
  }, 3000);
}


export function formatNPR(amount) {
  return `रू ${amount.toFixed(2)}`;
}


export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}


export function generateSku() {
  return `SKU-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}