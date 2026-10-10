const $ = (id) => document.getElementById(id);
const SAVED_KEY = "savedSchemes";
let catalogue = [];

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  Object.assign(node, attrs);
  return node;
}

const getSaved = () => JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");

function toggleSaved(id) {
  const saved = getSaved();
  const next = saved.includes(id) ? saved.filter((s) => s !== id) : [...saved, id];
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
}

function schemeCard(scheme, onChange) {
  const card = el("article", "", { className: "card" });
  card.append(
    el("h3", scheme.title),
    el("p", scheme.summary),
    el("p", `${scheme.scope} | ${scheme.category}`, { className: "muted" }),
    el("p", `Status: ${scheme.verification}`, { className: "muted" }),
    el("a", "Official site", { href: scheme.applyUrl, target: "_blank", rel: "noopener" }),
    el("a", "Source", { href: scheme.sourceUrl, target: "_blank", rel: "noopener" })
  );
  const saveBtn = el("button", getSaved().includes(scheme.id) ? "Remove from saved" : "Save", { type: "button" });
  saveBtn.addEventListener("click", () => { toggleSaved(scheme.id); onChange(); });
  card.append(saveBtn);
  return card;
}

function renderResults() {
  const box = $("results");
  box.replaceChildren();
  if (!catalogue.length) box.append(el("p", "No schemes match your search."));
  catalogue.forEach((s) => box.append(schemeCard(s, renderResults)));
}

async function search(q = "") {
  const res = await fetch(`/api/schemes?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  catalogue = data.entries;
  $("catalogueNote").textContent = data.note;
  renderResults();
}

async function renderSaved() {
  const box = $("savedList");
  box.replaceChildren();
  const all = await (await fetch("/api/schemes")).json();
  const mine = all.entries.filter((s) => getSaved().includes(s.id));
  if (!mine.length) box.append(el("p", "You have not saved any schemes yet. Save one from Discover schemes."));
  mine.forEach((s) => box.append(schemeCard(s, renderSaved)));
}

async function fillSchemeSelect() {
  const all = await (await fetch("/api/schemes")).json();
  $("askScheme").replaceChildren(...all.entries.map((s) => el("option", s.title, { value: s.id })));
}

$("searchForm").addEventListener("submit", (e) => { e.preventDefault(); search($("q").value); });
$("homeSearch").addEventListener("submit", (e) => {
  e.preventDefault();
  $("q").value = e.target.q.value;
  location.hash = "#discover";
});

$("askForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = $("answer");
  out.replaceChildren(el("p", "Thinking..."));
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: $("askText").value,
      schemeId: $("askScheme").value,
      language: $("askLang").value,
    }),
  });
  const data = await res.json();
  if (!res.ok) return out.replaceChildren(el("p", data.error, { className: "err" }));
  out.replaceChildren(
    el("p", data.answer),
    el("a", "Official source", { href: data.sourceUrl, target: "_blank", rel: "noopener" })
  );
});

const toBlob = (canvas, type, quality) => new Promise((done) => canvas.toBlob(done, type, quality));
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This file could not be read as an image.")); };
    img.src = url;
  });
}

async function smallestUnder(canvas, maxBytes) {
  let low = 0.1, high = 0.95, best = null;
  for (let i = 0; i < 8; i++) {
    const quality = (low + high) / 2;
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob.size <= maxBytes) { best = blob; low = quality; } else { high = quality; }
  }
  return best;
}

let beforeUrl = null, afterUrl = null;

$("imageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("studioMessage");
  const file = $("file").files[0];
  const maxBytes = Number($("maxKb").value) * 1024;
  msg.className = "";
  msg.textContent = "";

  let loaded;
  try { loaded = await loadImage(file); } catch (err) { msg.className = "err"; msg.textContent = err.message; return; }

  const { img, url } = loaded;
  const w = Number($("width").value) || img.naturalWidth;
  const h = Number($("height").value) || img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const result = await smallestUnder(canvas, maxBytes);
  if (beforeUrl) URL.revokeObjectURL(beforeUrl);
  if (afterUrl) URL.revokeObjectURL(afterUrl);
  beforeUrl = url;
  afterUrl = null;
  $("before").src = url;
  $("beforeInfo").textContent = `Original: ${img.naturalWidth}x${img.naturalHeight}px, ${kb(file.size)}`;

  const stretched = Math.abs(w / h - img.naturalWidth / img.naturalHeight) > 0.01;
  if (!result) {
    $("download").hidden = true;
    msg.className = "err";
    msg.textContent = `Could not get under ${kb(maxBytes)} at this size. Try smaller dimensions or a larger limit.`;
    return;
  }
  afterUrl = URL.createObjectURL(result);
  $("after").src = afterUrl;
  $("afterInfo").textContent = `Processed: ${w}x${h}px, ${kb(result.size)}`;
  $("download").href = afterUrl;
  $("download").download = "processed.jpg";
  $("download").hidden = false;
  msg.className = "ok";
  msg.textContent = `Done. Final size is ${kb(result.size)}, under your ${kb(maxBytes)} limit.` +
    (stretched ? " Note: the new dimensions change the original proportions." : "");
});

function showView() {
  const name = location.hash.slice(1) || "home";
  document.querySelectorAll("[data-view]").forEach((s) => { s.hidden = s.id !== name; });
  document.querySelectorAll(".sidebar a").forEach((a) => a.classList.toggle("active", a.hash === `#${name}`));
  if (name === "discover") search($("q").value);
  if (name === "saved") renderSaved();
}

window.addEventListener("hashchange", showView);
fillSchemeSelect();
showView();
