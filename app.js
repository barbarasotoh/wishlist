(() => {
  "use strict";

  // ---------- Config ----------

  const cfg = window.WISHLIST_CONFIG || {};
  const DEMO = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || new URLSearchParams(location.search).has("demo");

  const LISTS = {
    barbara: { name: "Bárbara" },
    carlos: { name: "Carlos" },
    home: { name: "Home" },
  };

  const PRIORITIES = {
    4: { label: "Need it", es: "Lo necesito" },
    3: { label: "Want it", es: "Lo quiero mucho" },
    2: { label: "Nice to have", es: "Me gustaría" },
    1: { label: "Someday", es: "Algún día" },
  };

  const PRICE_TIERS = {
    1: "Menos de $5,000",
    2: "De $5,000 a $10,000",
    3: "De $10,000 a $15,000",
    4: "Más de $15,000",
  };

  function tierHtml(tier) {
    return `<span class="tier" title="${PRICE_TIERS[tier]}">${"$".repeat(tier)}<span class="off">${"$".repeat(4 - tier)}</span></span>`;
  }

  const DEFAULT_ROOMS = ["Cocina", "Sala", "Comedor", "Recámara", "Baño", "General"];

  // ---------- Data stores ----------

  function demoStore() {
    const KEY = "wishlist-demo-v1";
    const now = Date.now();
    const day = 86400000;
    const seed = [
      { list: "barbara", name: "Bolsa de piel café", price_tier: 1, priority: 4, notes: "Tamaño mediano, que quepa la laptop", link: "https://example.com", updated_at: now - 2 * day },
      { list: "barbara", name: "Perfume", price_tier: 1, priority: 3, notes: "El de 100 ml", updated_at: now - 5 * day },
      { list: "barbara", name: "Clases de cerámica", priority: 2, updated_at: now - 1 * day },
      { list: "barbara", name: "Libro de recetas", priority: 1, updated_at: now - 9 * day, received: true, received_at: now - day },
      { list: "carlos", name: "Audífonos inalámbricos", price_tier: 2, priority: 4, notes: "Con cancelación de ruido", updated_at: now - 3 * day },
      { list: "carlos", name: "Tenis para correr", price_tier: 1, priority: 3, size: "27", color: "Blanco", updated_at: now - 6 * day },
      { list: "carlos", name: "Cafetera de goteo", priority: 2, updated_at: now - 4 * day },
      { list: "home", name: "Sartén antiadherente", price: 890, priority: 4, room: "Cocina", updated_at: now - day },
      { list: "home", name: "Lámpara de pie", price: 1750, priority: 3, room: "Sala", notes: "Luz cálida", updated_at: now - 2 * day },
      { list: "home", name: "Juego de toallas", priority: 3, room: "Baño", updated_at: now - 7 * day },
      { list: "home", name: "Tapete", priority: 2, room: "Recámara", updated_at: now - 8 * day },
      { list: "home", name: "Plantas", priority: 1, room: "General", updated_at: now - 10 * day },
    ].map((it) => ({
      id: crypto.randomUUID(),
      link: "", photo_url: "", notes: "", price: null, price_tier: null, room: null, size: "", color: "",
      received: false, received_at: null,
      created_at: new Date(it.updated_at).toISOString(),
      ...it,
      updated_at: new Date(it.updated_at).toISOString(),
      received_at: it.received_at ? new Date(it.received_at).toISOString() : null,
    }));

    const read = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) { /* ignore */ }
      return seed;
    };
    let items = read();
    const persist = () => {
      try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) { /* ignore */ }
    };

    return {
      async getSession() { return { user: { email: "demo" } }; },
      async signIn() {},
      async signOut() {},
      async list() { return items.map((i) => ({ ...i })); },
      async insert(data) {
        const now = new Date().toISOString();
        const it = { id: crypto.randomUUID(), received: false, received_at: null, created_at: now, ...data };
        items.push(it);
        persist();
        return { ...it };
      },
      async update(id, patch) {
        const it = items.find((i) => i.id === id);
        Object.assign(it, patch);
        persist();
        return { ...it };
      },
      async remove(id) {
        items = items.filter((i) => i.id !== id);
        persist();
      },
      async uploadPhoto(blob) {
        return new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      },
    };
  }

  function supabaseStore() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const check = ({ data, error }) => {
      if (error) throw error;
      return data;
    };
    return {
      async getSession() {
        const { data } = await sb.auth.getSession();
        return data.session;
      },
      async signIn(email, password) {
        check(await sb.auth.signInWithPassword({ email, password }));
      },
      async signOut() { await sb.auth.signOut(); },
      async list() { return check(await sb.from("items").select("*")); },
      async insert(data) { return check(await sb.from("items").insert(data).select().single()); },
      async update(id, patch) { return check(await sb.from("items").update(patch).eq("id", id).select().single()); },
      async remove(id) { check(await sb.from("items").delete().eq("id", id)); },
      async uploadPhoto(blob) {
        const path = `${crypto.randomUUID()}.jpg`;
        check(await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" }));
        return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
      },
    };
  }

  const store = DEMO ? demoStore() : supabaseStore();

  // ---------- State ----------

  const state = {
    session: null,
    items: [],
    roomFilter: "Todo",
  };

  const app = document.getElementById("app");

  // ---------- Helpers ----------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const safeUrl = (u) => {
    if (!u) return "";
    let url = String(u).trim();
    if (url.startsWith("data:image/")) return url;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
      const parsed = new URL(url);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : "";
    } catch (_) {
      return "";
    }
  };

  const dateFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });
  const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : "");

  const priceFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2, minimumFractionDigits: 0 });
  const fmtPrice = (n) => priceFmt.format(Number(n));

  const hostOf = (u) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return "Ver"; }
  };

  function sortItems(items) {
    const pending = items.filter((i) => !i.received).sort((a, b) =>
      b.priority - a.priority || new Date(b.updated_at) - new Date(a.updated_at));
    const received = items.filter((i) => i.received).sort((a, b) =>
      new Date(b.received_at || b.updated_at) - new Date(a.received_at || a.updated_at));
    return { pending, received };
  }

  function starsHtml(priority, id) {
    let html = `<span class="stars" role="radiogroup" aria-label="Prioridad">`;
    for (let n = 1; n <= 4; n++) {
      html += `<button type="button" class="star ${n <= priority ? "on" : ""}" data-star="${n}" ${id ? `data-id="${id}"` : ""}
        role="radio" aria-checked="${n === priority}" title="${n} · ${PRIORITIES[n].label}">★</button>`;
    }
    return html + `</span>`;
  }

  let toastTimer;
  function toast(msg) {
    document.querySelector(".toast")?.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  const route = () => {
    const r = location.hash.replace(/^#\/?/, "");
    return LISTS[r] ? r : "";
  };

  async function refresh() {
    try {
      state.items = await store.list();
    } catch (e) {
      console.error(e);
      toast("No se pudo cargar la lista");
    }
    render();
  }

  // ---------- Render ----------

  function render() {
    if (!state.session) return renderLogin();

    const current = route();
    const tabs = Object.entries(LISTS).map(([key, l]) =>
      `<a class="tab theme-${key} ${current === key ? "active" : ""}" href="#/${key}">${l.name}</a>`).join("");

    app.innerHTML = `
      ${DEMO ? `<div class="demo-banner">Modo demo · los cambios solo se guardan en este navegador</div>` : ""}
      <header class="topbar">
        <div class="wrap">
          <a class="brand" href="#/">Wish List</a>
          <nav class="tabs">${tabs}</nav>
          ${DEMO ? "" : `<button class="link-btn logout" data-action="logout">Salir</button>`}
        </div>
      </header>
      <main class="wrap ${current ? `theme-${current}` : ""}">${current ? listView(current) : homeView()}</main>`;
  }

  function homeView() {
    const tiles = Object.entries(LISTS).map(([key, l]) => {
      const n = state.items.filter((i) => i.list === key && !i.received).length;
      return `<a class="tile theme-${key}" href="#/${key}">
        <h2>${l.name}</h2>
        <p>${n} en la lista</p>
      </a>`;
    }).join("");

    const legend = [4, 3, 2, 1].map((n) => `
      <div class="legend-row">
        ${starsHtml(n).replace(/<button/g, '<button tabindex="-1" disabled')}
        <div><strong>${PRIORITIES[n].label}</strong> <span class="muted">· ${PRIORITIES[n].es}</span></div>
      </div>`).join("");

    return `
      <section class="hero">
        <h1>Wish List</h1>
        <p>Bárbara &amp; Carlos</p>
      </section>
      <section class="list-tiles">${tiles}</section>
      <section class="legend">
        <h3>Prioridad</h3>
        ${legend}
      </section>
      <section class="legend">
        <h3>Precio</h3>
        ${[1, 2, 3, 4].map((t) => `
          <div class="legend-row">
            ${tierHtml(t)}
            <div><span class="muted">${PRICE_TIERS[t]}</span></div>
          </div>`).join("")}
      </section>`;
  }

  function roomsInUse() {
    const set = new Set(DEFAULT_ROOMS);
    state.items.forEach((i) => i.list === "home" && i.room && set.add(i.room));
    return [...set];
  }

  function listView(key) {
    let items = state.items.filter((i) => i.list === key);
    let chips = "";
    if (key === "home") {
      const rooms = ["Todo", ...new Set(items.map((i) => i.room || "General"))];
      if (!rooms.includes(state.roomFilter)) state.roomFilter = "Todo";
      chips = `<div class="chips">${rooms.map((r) =>
        `<button class="chip ${r === state.roomFilter ? "active" : ""}" data-room="${esc(r)}">${esc(r)}</button>`).join("")}</div>`;
      if (state.roomFilter !== "Todo") items = items.filter((i) => (i.room || "General") === state.roomFilter);
    }

    const { pending, received } = sortItems(items);
    const n = pending.length;

    const body = !items.length
      ? `<div class="empty">Todavía no hay nada aquí.<br><br><button class="btn btn-ghost" data-action="add">+ Agregar el primero</button></div>`
      : `<div class="grid">${pending.map(cardHtml).join("")}</div>
         ${received.length ? `<div class="section-label">Recibidos · ${received.length}</div>
         <div class="grid">${received.map(cardHtml).join("")}</div>` : ""}`;

    return `
      <div class="list-head">
        <div>
          <h1>${LISTS[key].name}</h1>
          <p>${n} en la lista${received.length ? ` · ${received.length} recibido${received.length === 1 ? "" : "s"}` : ""}</p>
        </div>
        <button class="btn" data-action="add">+ Agregar</button>
      </div>
      ${chips}
      ${body}
      <div style="height:80px"></div>`;
  }

  function cardHtml(it) {
    const photo = safeUrl(it.photo_url);
    const link = safeUrl(it.link);
    return `
      <article class="card ${it.received ? "is-received" : ""}">
        <button type="button" class="photo ${photo ? "has-img" : ""}" data-edit="${it.id}" aria-label="Editar ${esc(it.name)}">
          ${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : `<span class="placeholder">${esc((it.name || "?").trim()[0]?.toUpperCase())}</span>`}
        </button>
        <div class="body">
          <div class="title-row">
            <h3>${esc(it.name)}</h3>
            <button type="button" class="check" data-check="${it.id}" aria-pressed="${!!it.received}"
              title="${it.received ? "Recibido · desmarcar" : "Marcar como recibido"}">✓</button>
          </div>
          ${it.list === "home"
            ? (it.price != null && it.price !== "" ? `<p class="price">${fmtPrice(it.price)}</p>` : "")
            : (it.price_tier ? `<p class="price">${tierHtml(it.price_tier)}</p>` : "")}
          <div class="priority">
            ${starsHtml(it.priority, it.id)}
            <small>${PRIORITIES[it.priority]?.label || ""}</small>
          </div>
          ${it.list === "home" && it.room ? `<span class="room-tag">${esc(it.room)}</span>` : ""}
          ${it.list !== "home" && (it.size || it.color) ? `<p class="specs">${[
            it.size ? `<span><b>Talla</b> ${esc(it.size)}</span>` : "",
            it.color ? `<span><b>Color</b> ${esc(it.color)}</span>` : "",
          ].join("")}</p>` : ""}
          ${it.notes ? `<p class="notes">${esc(it.notes)}</p>` : ""}
          <div class="meta">
            ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(hostOf(link))} ↗</a>` : ""}
            <span>${it.received ? `Recibido ${fmtDate(it.received_at)}` : `Actualizado ${fmtDate(it.updated_at)}`}</span>
          </div>
          <button type="button" class="link-btn" data-edit="${it.id}" style="align-self:flex-start">Editar</button>
        </div>
      </article>`;
  }

  function renderLogin(error = "") {
    app.innerHTML = `
      <div class="login">
        <form id="login-form">
          <h1>Wish List</h1>
          <label class="field"><span>Correo</span><input name="email" type="email" autocomplete="username" required></label>
          <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password" required></label>
          <p class="form-error">${esc(error)}</p>
          <button class="btn" type="submit">Entrar</button>
        </form>
      </div>`;
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector("button");
      btn.disabled = true;
      try {
        await store.signIn(f.email.value.trim(), f.password.value);
        state.session = await store.getSession();
        await refresh();
      } catch (err) {
        renderLogin("Correo o contraseña incorrectos");
      }
    });
  }

  // ---------- Actions ----------

  async function setPriority(id, priority) {
    const it = state.items.find((i) => i.id === id);
    if (!it || it.priority === priority) return;
    const patch = { priority, updated_at: new Date().toISOString() };
    Object.assign(it, patch);
    render();
    try {
      await store.update(id, patch);
    } catch (e) {
      console.error(e);
      toast("No se pudo guardar");
      refresh();
    }
  }

  async function toggleReceived(id) {
    const it = state.items.find((i) => i.id === id);
    if (!it) return;
    const received = !it.received;
    const patch = { received, received_at: received ? new Date().toISOString() : null };
    Object.assign(it, patch);
    render();
    toast(received ? "Marcado como recibido" : "Regresó a la lista");
    try {
      await store.update(id, patch);
    } catch (e) {
      console.error(e);
      toast("No se pudo guardar");
      refresh();
    }
  }

  app.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || t.disabled) return;
    if (t.dataset.star && t.dataset.id) return setPriority(t.dataset.id, Number(t.dataset.star));
    if (t.dataset.check) return toggleReceived(t.dataset.check);
    if (t.dataset.edit) return openDialog(state.items.find((i) => i.id === t.dataset.edit));
    if (t.dataset.room) { state.roomFilter = t.dataset.room; return render(); }
    if (t.dataset.action === "add") return openDialog(null);
    if (t.dataset.action === "logout") {
      store.signOut().then(() => { state.session = null; state.items = []; render(); });
    }
  });

  // ---------- Dialog ----------

  const dialog = document.getElementById("item-dialog");
  const form = document.getElementById("item-form");
  const preview = document.getElementById("photo-preview");
  const formStars = document.getElementById("form-stars");
  const formPriorityLabel = document.getElementById("form-priority-label");
  const formError = document.getElementById("form-error");
  let editing = null;
  let formPriority = 3;
  let pendingBlob = null;

  const formTiers = document.getElementById("form-tiers");
  let formTier = null;

  function setFormTier(t) {
    formTier = t;
    formTiers.querySelectorAll("[data-tier]").forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.tier) === t)));
    document.getElementById("form-tier-label").textContent = t ? PRICE_TIERS[t] : "Opcional";
  }

  formTiers.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tier]");
    if (!b) return;
    const t = Number(b.dataset.tier);
    setFormTier(formTier === t ? null : t);
  });

  function setFormPriority(p) {
    formPriority = p;
    formStars.innerHTML = starsHtml(p).replace(/^<span class="stars"[^>]*>|<\/span>$/g, "");
    formPriorityLabel.textContent = `${PRIORITIES[p].label} · ${PRIORITIES[p].es}`;
  }

  function setPreview(src) {
    preview.innerHTML = src ? `<img src="${esc(src)}" alt="">` : "";
  }

  function openDialog(item) {
    editing = item;
    pendingBlob = null;
    form.reset();
    formError.textContent = "";
    const list = item?.list || route();
    dialog.className = `theme-${list}`;
    document.getElementById("dialog-title").textContent = item ? "Editar" : `Agregar a ${LISTS[list].name}`;
    form.name.value = item?.name || "";
    form.link.value = item?.link || "";
    form.price.value = item?.price ?? "";
    form.notes.value = item?.notes || "";
    const photo = item?.photo_url || "";
    form.photo_url.value = photo.startsWith("data:") ? "" : photo;
    form.dataset.photo = photo;
    setPreview(safeUrl(photo));
    setFormPriority(item?.priority || 3);

    const isHome = list === "home";
    setFormTier(item?.price_tier || null);
    document.getElementById("price-field").hidden = !isHome;
    document.getElementById("tier-field").hidden = isHome;
    document.getElementById("room-field").hidden = !isHome;
    document.getElementById("size-color-fields").hidden = isHome;
    form.size.value = item?.size || "";
    form.color.value = item?.color || "";
    form.room.value = item?.room || (isHome && state.roomFilter !== "Todo" ? state.roomFilter : "");
    document.getElementById("rooms").innerHTML = roomsInUse().map((r) => `<option value="${esc(r)}">`).join("");

    deleteBtn.hidden = !item;
    delete deleteBtn.dataset.armed;
    deleteBtn.textContent = "Borrar";
    dialog.showModal();
    if (!item) form.name.focus();
  }

  formStars.addEventListener("click", (e) => {
    const s = e.target.closest("[data-star]");
    if (s) setFormPriority(Number(s.dataset.star));
  });

  form.photo_file.addEventListener("change", async () => {
    const file = form.photo_file.files[0];
    if (!file) return;
    try {
      pendingBlob = await resizeImage(file);
      form.photo_url.value = "";
      setPreview(URL.createObjectURL(pendingBlob));
    } catch (e) {
      console.error(e);
      formError.textContent = "No se pudo leer esa imagen";
    }
  });

  form.photo_url.addEventListener("input", () => {
    pendingBlob = null;
    form.dataset.photo = form.photo_url.value.trim();
    setPreview(safeUrl(form.dataset.photo));
  });

  document.getElementById("photo-clear").addEventListener("click", () => {
    pendingBlob = null;
    form.photo_url.value = "";
    form.dataset.photo = "";
    setPreview("");
  });

  document.getElementById("cancel-btn").addEventListener("click", () => dialog.close());

  const deleteBtn = document.getElementById("delete-btn");
  deleteBtn.addEventListener("click", async () => {
    if (!editing) return;
    if (!deleteBtn.dataset.armed) {
      deleteBtn.dataset.armed = "1";
      deleteBtn.textContent = "¿Seguro? Toca otra vez para borrar";
      return;
    }
    try {
      await store.remove(editing.id);
      state.items = state.items.filter((i) => i.id !== editing.id);
      dialog.close();
      render();
      toast("Borrado");
    } catch (e) {
      console.error(e);
      formError.textContent = "No se pudo borrar";
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("save-btn");
    saveBtn.disabled = true;
    formError.textContent = "";
    try {
      let photo_url = form.dataset.photo || "";
      if (pendingBlob) photo_url = await store.uploadPhoto(pendingBlob);
      const list = editing?.list || route();
      const data = {
        name: form.name.value.trim(),
        link: form.link.value.trim() ? safeUrl(form.link.value) : "",
        price: list !== "home" || form.price.value.trim() === "" ? null : Number(form.price.value.replace(/[^0-9.]/g, "")),
        price_tier: list === "home" ? null : formTier,
        notes: form.notes.value.trim(),
        photo_url,
        priority: formPriority,
        room: list === "home" ? (form.room.value.trim() || "General") : null,
        size: list === "home" ? null : form.size.value.trim(),
        color: list === "home" ? null : form.color.value.trim(),
        updated_at: new Date().toISOString(),
      };
      if (!data.name) throw new Error("Falta el nombre");
      if (editing) {
        const saved = await store.update(editing.id, data);
        Object.assign(editing, saved);
      } else {
        const saved = await store.insert({ ...data, list });
        state.items.push(saved);
      }
      dialog.close();
      render();
      toast("Guardado");
    } catch (err) {
      console.error(err);
      formError.textContent = err.message === "Falta el nombre" ? err.message : "No se pudo guardar. Intenta de nuevo.";
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function resizeImage(file, max = 1000) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85));
  }

  // ---------- Boot ----------

  window.addEventListener("hashchange", () => { render(); window.scrollTo({ top: 0 }); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.session && !dialog.open) refresh();
  });

  (async () => {
    state.session = await store.getSession();
    if (state.session) await refresh();
    else render();
  })();
})();
