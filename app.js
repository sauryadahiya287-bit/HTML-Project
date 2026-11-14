(() => {
  "use strict";

  const STORAGE = {
    favorites: "pulseEvents.favorites.v1",
    selected: "pulseEvents.selectedEvent.v1",
  };
  const ROUTES = {
    "explore-events": "/explore_events_ticketing/code.html",
    calendar: "/explore_events_ticketing/code.html?calendar=1",
    "host-an-event": "/add_event_modal_sql_schema_form/code.html?create=1",
    "create-event": "/add_event_modal_sql_schema_form/code.html?create=1",
    "my-tickets": "/my_tickets_pass_wallet/code.html",
  };
  const CATALOG = [
    { id: "sample-tech-summit-2026", name: "Tech Summit 2026", price: 499, category: "tech", date: "15 Nov 2026", venue: "Bengaluru Convention Centre", description: "India's premier symposium on neural architecture and quantum computing.", isSample: true },
    { id: "sample-college-fest-euphoria", name: "College Fest Euphoria", price: 199, category: "campus", date: "20 Dec 2026", venue: "Delhi University Campus", description: "Three days of campus culture, live music and performances.", isSample: true },
    { id: "sample-global-fintech-forum", name: "Global Fintech Forum", price: 799, category: "tech", date: "28 Nov 2026", venue: "Jio World Centre, Mumbai", description: "A gathering for the people building the future of finance.", isSample: true },
    { id: "sample-neon-music-festival", name: "Neon Music Festival", price: 399, category: "music", date: "05 Dec 2026", venue: "Vagator Hilltop Arena, Goa", description: "A night of electronic music beneath the open sky.", isSample: true },
    { id: "sample-design-ux-conclave", name: "Design & UX Conclave", price: 349, category: "design", date: "12 Dec 2026", venue: "Bengaluru International Centre", description: "A curated day for designers, researchers and creative founders.", isSample: true },
  ];
  let databaseEvents = [...CATALOG];
  let databaseBookings = [];
  let databaseAvailable = false;

  const safeRead = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  };
  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      notify("This browser could not save the demo data.");
      return false;
    }
  };
  async function apiRequest(path, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
    });
    let result = {};
    try { result = await response.json(); } catch (_) { /* handled below */ }
    if (!response.ok) throw new Error(result.error || `The server returned ${response.status}.`);
    return result;
  }
  const money = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;
  const clean = value => String(value ?? "").trim();
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const params = new URLSearchParams(location.search);
  const page = location.pathname;

  function notify(message) {
    let toast = document.getElementById("pulse-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "pulse-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  function openRoute(route, query = {}) {
    const url = new URL(route, location.origin);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    location.href = url.pathname + url.search;
  }

  function canonicalEvent(name) {
    const normalized = clean(name).toLowerCase();
    return databaseEvents.find(event => event.name.toLowerCase() === normalized)
      || CATALOG.find(event => event.name.toLowerCase() === normalized)
      || null;
  }

  function installStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #pulse-toast { position:fixed; z-index:10000; left:50%; bottom:24px; transform:translate(-50%,20px);
        opacity:0; pointer-events:none; transition:.2s ease; max-width:min(92vw,520px); padding:12px 18px;
        border:1px solid rgba(192,193,255,.32); border-radius:8px; color:#e1e1ef; background:#282933;
        box-shadow:0 10px 32px #0008; font:500 14px/1.45 Manrope,system-ui,sans-serif; }
      #pulse-toast.visible { opacity:1; transform:translate(-50%,0); }
      .pe-mobile-nav { display:none; }
      .pe-modal-open .pe-mobile-nav { display:none !important; }
      .pe-demo-note { margin-top:12px; padding:10px 12px; border:1px solid rgba(255,185,95,.3);
        border-radius:6px; background:rgba(255,185,95,.08); color:#ffcf91; font:12px/1.5 Manrope,system-ui,sans-serif; }
      .pe-event-added { border:1px solid rgba(255,255,255,.08); border-radius:12px; overflow:hidden;
        background:#191b24; color:#e1e1ef; box-shadow:0 8px 24px #0003; }
      .pe-event-added .pe-event-art { min-height:130px; display:flex; align-items:flex-end; padding:18px;
        background:radial-gradient(ellipse at 70% 30%,#6263be88,transparent 55%),linear-gradient(135deg,#282933,#151620); }
      .pe-event-added .pe-event-body { padding:16px; }
      .pe-booking-panel { margin:0 0 24px; padding:18px; border:1px solid rgba(192,193,255,.23);
        border-radius:12px; background:#191b24; color:#e1e1ef; }
      .pe-booking-panel h2 { margin:0 0 12px; font:600 20px/1.3 Outfit,system-ui,sans-serif; }
      .pe-booking-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
      .pe-booking-item { padding:14px; border:1px solid #ffffff14; border-radius:8px; background:#11131c; }
      .pe-calendar-backdrop, .pe-pass-backdrop { position:fixed; inset:0; z-index:9998; display:grid;
        place-items:center; padding:20px; background:#080912d9; backdrop-filter:blur(10px); }
      .pe-dialog { width:min(680px,100%); max-height:min(82vh,780px); overflow:auto; padding:22px;
        border:1px solid #ffffff18; border-radius:12px; background:#191b24; color:#e1e1ef;
        box-shadow:0 24px 80px #0009; font-family:Manrope,system-ui,sans-serif; }
      .pe-dialog h2 { margin:0 0 8px; color:#e1e1ef; font:600 26px/1.2 Outfit,system-ui,sans-serif; }
      .pe-dialog p { color:#c7c4d7; line-height:1.5; }
      .pe-dialog button, .pe-dialog a { display:inline-flex; align-items:center; justify-content:center; gap:8px;
        min-height:40px; padding:8px 14px; border:1px solid #ffffff1c; border-radius:6px;
        color:#e1e1ef; background:#282933; text-decoration:none; cursor:pointer; font:600 13px Outfit,system-ui,sans-serif; }
      .pe-dialog .pe-primary { border-color:transparent; color:#1000a9; background:#c0c1ff; }
      .pe-calendar-row { display:flex; justify-content:space-between; gap:16px; align-items:center;
        padding:12px 0; border-bottom:1px solid #ffffff12; }
      @media (max-width:767px) {
        .pe-mobile-nav { position:fixed; z-index:80; left:0; right:0; bottom:0; display:grid;
          grid-template-columns:repeat(4,1fr); padding:8px 4px max(8px,env(safe-area-inset-bottom));
          border-top:1px solid #ffffff12; background:#11131ced; backdrop-filter:blur(16px); }
        .pe-mobile-nav a { display:flex; flex-direction:column; align-items:center; gap:3px; color:#c7c4d7;
          text-decoration:none; font:600 10px/1.2 Outfit,system-ui,sans-serif; }
        .pe-mobile-nav .pe-icon { font-size:18px; }
        body { padding-bottom:55px !important; }
      }
      @media (min-width:768px) and (max-width:1279px) {
        .pe-mobile-nav { position:fixed; z-index:80; left:0; right:0; bottom:0; display:grid;
          grid-template-columns:repeat(4,1fr); padding:8px 4px;
          border-top:1px solid #ffffff12; background:#11131ced; backdrop-filter:blur(16px); }
        .pe-mobile-nav a { display:flex; flex-direction:column; align-items:center; gap:3px; color:#c7c4d7;
          text-decoration:none; font:600 10px/1.2 Outfit,system-ui,sans-serif; }
        .pe-mobile-nav .pe-icon { font-size:18px; }
        body { padding-bottom:55px !important; }
      }
      @media print {
        header, footer, .pe-mobile-nav, #pulse-toast, button, a { display:none !important; }
        html, body, main { color:#111 !important; background:#fff !important; box-shadow:none !important; }
        main { padding-top:0 !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function showDatabaseStatus() {
    const main = document.querySelector("main > div") || document.querySelector("main");
    if (!main) return;
    const status = document.createElement("div");
    status.className = "pe-database-status";
    status.setAttribute("role", databaseAvailable ? "status" : "alert");
    status.style.cssText = "margin:12px 0;padding:10px 14px;border-radius:7px;font:500 12px/1.5 Manrope,system-ui,sans-serif";
    if (databaseAvailable) {
      status.textContent = "PostgreSQL connected · event listings and booking requests save online.";
      status.style.cssText += ";border:1px solid #45d6a644;background:#16302a;color:#a7f3d0";
    } else {
      status.textContent = "Database unavailable · sample events are read-only; new events and bookings cannot be saved.";
      status.style.cssText += ";border:1px solid #ffb95f55;background:#30271d;color:#ffcf91";
    }
    const intro = main.firstElementChild;
    main.insertBefore(status, intro?.nextElementSibling || null);
  }

  function setupBrandAndNavigation() {
    document.querySelectorAll("a[data-path]").forEach(link => {
      const key = link.dataset.path;
      if (ROUTES[key]) link.href = ROUTES[key];
    });
    const brand = document.querySelector('header a[data-path="explore-events"] img');
    if (brand) {
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "✦";
      mark.style.cssText = "display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#c0c1ff;color:#1000a9;font:700 20px Outfit,system-ui,sans-serif";
      brand.replaceWith(mark);
    }
    document.querySelectorAll("img").forEach(image => {
      image.addEventListener("error", () => {
        image.dataset.imageFailed = "true";
        image.style.visibility = "hidden";
        if (image.parentElement) image.parentElement.style.background =
          "radial-gradient(ellipse at 70% 35%,#6263be66,transparent 55%),linear-gradient(135deg,#282933,#151620)";
      }, { once: true });
    });
    document.querySelectorAll("header span").forEach(node => {
      if (/new york/i.test(node.textContent)) node.textContent = "BENGALURU";
    });
    const nav = document.createElement("nav");
    nav.className = "pe-mobile-nav";
    nav.setAttribute("aria-label", "Quick navigation");
    [
      ["explore-events", "◉", "Explore"],
      ["calendar", "▦", "Calendar"],
      ["host-an-event", "+", "Host"],
      ["my-tickets", "▣", "Tickets"],
    ].forEach(([route, icon, label]) => {
      const anchor = document.createElement("a");
      anchor.href = ROUTES[route];
      anchor.innerHTML = `<span class="pe-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;
      nav.appendChild(anchor);
    });
    document.body.appendChild(nav);
  }

  function eventFromCard(article) {
    const titleNode = article.querySelector("h2,h3,h4");
    const title = clean(titleNode?.textContent);
    const known = canonicalEvent(title);
    const text = article.innerText || "";
    const priceMatch = text.match(/₹\s*([\d,]+)/);
    const image = article.querySelector("img");
    return {
      ...(known || {}),
      name: title || known?.name || "PulseEvents experience",
      price: known?.price ?? (priceMatch ? Number(priceMatch[1].replaceAll(",", "")) : 499),
      category: known?.category || "music",
      date: known?.date || "",
      venue: known?.venue || "",
      description: known?.description || "",
      image: image?.src || "",
    };
  }

  function addCreatedEventCards() {
    const grid = [...document.querySelectorAll("main article")].find(article =>
      article.querySelector("h2,h3") && /₹/.test(article.innerText || ""))?.parentElement;
    if (!grid) return;
    grid.querySelectorAll(".pe-event-added").forEach(card => card.remove());
    databaseEvents.filter(event => !event.isSample).forEach(event => {
      const card = document.createElement("article");
      card.className = "pe-event-added";
      card.dataset.createdEvent = "true";
      card.dataset.eventCategory = event.category || "music";
      card.innerHTML = `<div class="pe-event-art"><span style="padding:5px 8px;border-radius:4px;background:#11131cbb;color:#ffb95f;font:700 10px Outfit,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em">Community event</span></div>
        <div class="pe-event-body"><p style="margin:0 0 8px;color:#c0c1ff;font:700 11px Outfit,system-ui,sans-serif;text-transform:uppercase">${escapeHtml(event.categoryLabel || "Community")}</p>
        <h3 style="margin:0 0 8px;font:600 20px Outfit,system-ui,sans-serif">${escapeHtml(event.name)}</h3>
        <p style="margin:0 0 12px;color:#c7c4d7;font:13px/1.5 Manrope,system-ui,sans-serif">${escapeHtml(event.description || "A new experience from the PulseEvents community.")}</p>
        <p style="margin:0 0 12px;color:#c7c4d7;font:12px/1.5 Manrope,system-ui,sans-serif">${escapeHtml(event.date)}${event.venue ? ` · ${escapeHtml(event.venue)}` : ""}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><strong style="font:700 20px Outfit,system-ui,sans-serif">${Number(event.price) ? money(event.price) : "Free"}</strong>
        <button type="button" data-book-event="${escapeHtml(event.name)}" style="padding:9px 14px;border:0;border-radius:5px;background:#c0c1ff;color:#1000a9;font:600 13px Outfit,system-ui,sans-serif;cursor:pointer">Preview booking →</button></div>
        <p style="margin:12px 0 0;color:#ffcf91;font:11px/1.4 Manrope,system-ui,sans-serif">Saved to the shared PostgreSQL catalogue</p></div>`;
      grid.appendChild(card);
    });
  }

  function setupFilters() {
    const articles = [...document.querySelectorAll("main article")].filter(article => article.querySelector("h2,h3"));
    if (!articles.length) return;
    let category = "all";
    const activeVenues = new Set();
    const search = document.getElementById("eventSearchInput");
    const headerSearch = document.querySelector('header input[type="text"]');
    const city = document.getElementById("citySelect");
    const savedCity = safeRead("pulseEvents.city.v1", "");
    if (city && [...city.options].some(option => option.value === savedCity)) city.value = savedCity;
    const sidebar = document.querySelector("main aside");
    const budgets = [...(sidebar?.querySelectorAll('input[type="checkbox"]') || [])];
    const venueButtons = [...(sidebar?.querySelectorAll("button") || [])]
      .filter(button => /convention centers|campuses & auditoriums|open air arenas/i.test(button.innerText));
    const sortSelect = [...document.querySelectorAll("main select")]
      .find(select => [...select.options].some(option => /popularity|price \(low/i.test(option.textContent)));
    const grid = articles[0].parentElement;
    let emptyState = document.getElementById("pulse-no-events");
    if (!emptyState && grid) {
      emptyState = document.createElement("p");
      emptyState.id = "pulse-no-events";
      emptyState.setAttribute("role", "status");
      emptyState.textContent = "No events match these filters. Reset the filters to see the full catalogue.";
      emptyState.style.cssText = "display:none;padding:20px;color:#c7c4d7;text-align:center";
      grid.insertAdjacentElement("afterend", emptyState);
    }
    const titleOf = article => clean(article.querySelector("h2,h3")?.textContent);
    const priceOf = article => {
      const known = canonicalEvent(titleOf(article));
      const match = (article.innerText || "").match(/₹\s*([\d,]+)/);
      return Number(known?.price ?? match?.[1]?.replaceAll(",", "") ?? 0);
    };
    const dateOf = article => {
      const known = canonicalEvent(titleOf(article));
      const match = (article.innerText || "").match(/\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b/);
      return Date.parse(known?.date || match?.[0] || "");
    };
    const venueTypeFor = text => /convention centers/i.test(text) ? "convention"
      : /campuses & auditoriums/i.test(text) ? "campus" : "arena";
    const venuePattern = {
      convention: /convention|centre|center|jio world/i,
      campus: /campus|university|auditorium/i,
      arena: /arena|open air|vagator|hilltop/i,
    };
    const syncCityPreference = () => {
      if (!city) return;
      const value = city.value;
      safeWrite("pulseEvents.city.v1", value);
      const headerLocation = [...document.querySelectorAll("header button")]
        .find(button => clean(button.querySelector(".material-symbols-outlined")?.textContent) === "location_on");
      const label = [...(headerLocation?.querySelectorAll("span") || [])]
        .find(span => !span.classList.contains("material-symbols-outlined") && clean(span.textContent) !== "expand_more");
      if (label) label.textContent = clean(city.selectedOptions[0]?.textContent).split("(")[0].trim().toUpperCase();
    };
    const sortCards = () => {
      if (!grid || !sortSelect) return;
      const mode = clean(sortSelect.selectedOptions[0]?.textContent).toLowerCase();
      const cards = [...grid.children].filter(card => card.matches("article") && card.querySelector("h2,h3"));
      const popularity = {
        "tech summit 2026": 1200,
        "college fest euphoria": 3500,
        "global fintech forum": 740,
        "neon music festival": 2300,
        "design & ux conclave": 470,
      };
      cards.sort((a, b) => {
        if (/price/.test(mode)) return priceOf(a) - priceOf(b);
        if (/popularity/.test(mode)) return (popularity[titleOf(b).toLowerCase()] || 0) - (popularity[titleOf(a).toLowerCase()] || 0);
        return dateOf(a) - dateOf(b);
      }).forEach(card => grid.appendChild(card));
    };
    const filter = () => {
      const query = clean(search?.value || headerSearch?.value).toLowerCase();
      const activeCategory = document.querySelector(".category-chip.bg-primary")?.dataset.cat || category;
      const selectedBudgets = budgets.filter(input => input.checked);
      let visible = 0;
      document.querySelectorAll("main article").forEach(article => {
        if (!article.querySelector("h2,h3")) return;
        const text = (article.innerText || "").toLowerCase();
        const title = titleOf(article);
        const event = canonicalEvent(title);
        const eventCategory = article.dataset.eventCategory || event?.category;
        const categoryMatches = activeCategory === "all" || activeCategory === eventCategory;
        const queryMatches = !query || text.includes(query);
        const amount = priceOf(article);
        const budgetMatches = !budgets.length || selectedBudgets.some(input => {
          const label = clean(input.parentElement?.innerText || input.parentElement?.parentElement?.innerText);
          if (/under\s*₹?200/i.test(label)) return amount < 200;
          if (/₹200\s*-\s*₹?500/i.test(label)) return amount >= 200 && amount <= 500;
          if (/₹500\+/i.test(label)) return amount > 500;
          return false;
        });
        const eventVenue = `${event?.venue || ""} ${text}`;
        const venueMatches = !activeVenues.size || [...activeVenues].some(type => venuePattern[type].test(eventVenue));
        const matches = categoryMatches && queryMatches && budgetMatches && venueMatches;
        article.style.display = matches ? "" : "none";
        if (matches) visible++;
      });
      if (emptyState) emptyState.style.display = visible ? "none" : "";
    };
    document.querySelectorAll(".category-chip").forEach(chip => chip.addEventListener("click", () => {
      category = chip.dataset.cat || "all";
      filter();
    }));
    [search, headerSearch].filter(Boolean).forEach(input => input.addEventListener("input", filter));
    document.getElementById("applySearchBtn")?.addEventListener("click", filter);
    venueButtons.forEach(button => {
      const type = venueTypeFor(button.innerText);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        if (activeVenues.has(type)) activeVenues.delete(type);
        else activeVenues.add(type);
        button.setAttribute("aria-pressed", String(activeVenues.has(type)));
        button.classList.toggle("ring-1", activeVenues.has(type));
        button.classList.toggle("ring-primary", activeVenues.has(type));
        filter();
      });
    });
    budgets.forEach(input => input.addEventListener("change", filter));
    city?.addEventListener("change", () => { syncCityPreference(); filter(); });
    sortSelect?.addEventListener("change", () => { sortCards(); filter(); });
    document.getElementById("resetFiltersBtn")?.addEventListener("click", () => {
      category = "all";
      document.querySelectorAll(".category-chip").forEach((chip, index) => {
        chip.classList.toggle("bg-primary", index === 0);
        chip.classList.toggle("text-on-primary", index === 0);
        chip.classList.toggle("bg-surface-container-high", index !== 0);
        chip.classList.toggle("text-on-surface-variant", index !== 0);
      });
      if (headerSearch) headerSearch.value = "";
      budgets.forEach(input => { input.checked = true; });
      activeVenues.clear();
      venueButtons.forEach(button => {
        button.setAttribute("aria-pressed", "false");
        button.classList.remove("ring-1", "ring-primary");
      });
      if (sortSelect) sortSelect.selectedIndex = 0;
      syncCityPreference();
      setTimeout(() => { sortCards(); filter(); }, 0);
    });
    sortCards();
    syncCityPreference();
    filter();
  }

  function routeToCheckout(event) {
    const chosen = { ...CATALOG[0], ...event, image: event.image || "" };
    safeWrite(STORAGE.selected, chosen);
    openRoute("/event_booking_ticket_checkout_drawer/code.html", {
      event: chosen.name,
      price: chosen.price,
    });
  }

  function setupEventForm() {
    const modal = document.getElementById("createEventModal");
    if (!modal) return;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "pulse-create-event-title");
    const modalTitle = modal.querySelector("h3");
    if (modalTitle) modalTitle.id = "pulse-create-event-title";
    modal.style.display = "flex";
    document.body.classList.add("pe-modal-open");
    const form = modal.querySelector("form");
    if (!form) return;
    const close = () => {
      modal.style.display = "none";
      document.body.classList.remove("pe-modal-open");
    };
    document.getElementById("closeModalBtn")?.addEventListener("click", close);
    document.getElementById("cancelModalBtn")?.addEventListener("click", close);
    const fields = [...form.querySelectorAll('input[type="text"]')];
    const [title, venue, date] = fields;
    const price = form.querySelector('input[type="number"]');
    const capacityInput = [...form.querySelectorAll('input[type="number"]')][1];
    const free = form.querySelector("#freeEventCheck");
    if (title) { title.value = ""; title.required = true; title.autocomplete = "off"; }
    if (venue) { venue.value = ""; venue.required = true; }
    if (date) { date.value = ""; date.required = true; date.placeholder = "e.g. 12 Dec 2026"; }
    if (price) { price.required = !free?.checked; price.min = "0"; }
    title?.focus({ preventScroll: true });
    free?.addEventListener("change", () => {
      if (price) { price.disabled = free.checked; price.required = !free.checked; if (free.checked) price.value = "0"; }
    });
    form.addEventListener("submit", event => event.preventDefault());
    const publish = [...modal.querySelectorAll("button")].find(button => /publish event/i.test(button.innerText));
    if (publish) {
      publish.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span><span>Publish event</span>';
      publish.disabled = !databaseAvailable;
    }
    if (modalTitle) modalTitle.textContent = "Create an event";
    modal.querySelectorAll("p").forEach(paragraph => {
      if (/publish a gathering/i.test(paragraph.textContent)) paragraph.textContent = "Publish an event to the shared catalogue.";
      if (/sql schema validation active/i.test(paragraph.textContent)) paragraph.textContent = "Events are validated by the server and saved in the project database.";
    });
    modal.querySelectorAll("code").forEach(code => {
      if (/events \(id, title, venue, date, price\)/i.test(code.textContent)) code.textContent = "PostgreSQL · shared events catalogue";
    });
    publish?.addEventListener("click", () => {
      const name = clean(title?.value);
      const place = clean(venue?.value);
      const when = clean(date?.value);
      const amount = free?.checked ? 0 : Number(price?.value);
      if (!name || !place || !when || (!free?.checked && (!price?.value || amount < 0))) {
        form.reportValidity();
        notify("Add an event name, venue, date and a valid ticket price.");
        return;
      }
      const categorySelect = form.querySelector("select");
      const categoryLabel = clean(categorySelect?.selectedOptions?.[0]?.textContent || "Community");
      const categoryText = categoryLabel.toLowerCase();
      const category = /tech|ai|business|finance/.test(categoryText) ? "tech"
        : /design|ux|art/.test(categoryText) ? "design"
          : /campus|college/.test(categoryText) ? "campus" : "music";
      if (!databaseAvailable) {
        notify("Database is unavailable. This event was not saved.");
        return;
      }
      const capacity = Math.max(1, Number(capacityInput?.value) || 1500);
      const description = `A new ${categoryLabel.toLowerCase()} experience from the PulseEvents community.`;
      publish.disabled = true;
      apiRequest("/api/events", {
        method: "POST",
        body: JSON.stringify({ name, venue: place, date: when, price: amount, category, categoryLabel, description, capacity }),
      }).then(result => {
        databaseEvents.push(result.event);
        notify("Event saved to the shared catalogue.");
        setTimeout(() => openRoute(ROUTES["explore-events"]), 500);
      }).catch(error => {
        notify(error.message || "The event could not be saved.");
      }).finally(() => { publish.disabled = false; });
    });
  }

  function showCalendar() {
    if (!params.has("calendar")) return;
    const backdrop = document.createElement("div");
    backdrop.className = "pe-calendar-backdrop";
    const dialog = document.createElement("section");
    dialog.className = "pe-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "pe-calendar-title");
    const events = [...databaseEvents]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    dialog.innerHTML = `<div style="display:flex;justify-content:space-between;gap:16px;align-items:start"><div><span style="color:#c0c1ff;font:700 11px Outfit,system-ui,sans-serif;letter-spacing:.1em">PULSEEVENTS</span><h2 id="pe-calendar-title">Upcoming experiences</h2><p style="margin:0">Events are loaded from the project database. Dates use your device's timezone.</p></div><button type="button" data-close-calendar aria-label="Close calendar">Close</button></div><div style="margin-top:14px">${events.map(event => `<div class="pe-calendar-row"><div><strong>${escapeHtml(event.name)}</strong><br><span style="color:#c7c4d7;font-size:12px">${escapeHtml(event.date)} · ${escapeHtml(event.venue || "Venue to be announced")}</span></div><button class="pe-primary" type="button" data-book-event="${escapeHtml(event.name)}">${Number(event.price) ? money(event.price) : "Free"} · Book</button></div>`).join("")}</div><p class="pe-demo-note">Booking requests are saved without charging. A payment provider is not connected.</p>`;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop || event.target.closest("[data-close-calendar]")) {
        if (params.has("calendar")) {
          params.delete("calendar");
          history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : ""));
        }
        backdrop.remove();
      }
    });
    dialog.querySelectorAll("[data-book-event]").forEach(button => button.addEventListener("click", () => {
      const event = canonicalEvent(button.dataset.bookEvent);
      if (event) routeToCheckout(event);
    }));
  }

  function checkoutEvent() {
    const saved = safeRead(STORAGE.selected, null);
    const requestedName = params.get("event");
    const event = canonicalEvent(requestedName) || (saved?.name === requestedName ? saved : null) || CATALOG[0];
    const price = Number(params.get("price"));
    return { ...event, ...(Number.isFinite(price) && params.has("price") ? { price } : {}) };
  }

  function setupCheckout() {
    const drawer = document.getElementById("ticketDrawer");
    const payButton = document.getElementById("paySubmitBtn");
    if (!drawer || !payButton) return;
    document.querySelector(".pe-mobile-nav")?.remove();
    document.body.style.paddingBottom = "0";
    const event = checkoutEvent();
    drawer.querySelectorAll("h2").forEach(heading => {
      if (/Tech Summit 2026/i.test(heading.textContent)) heading.textContent = event.name;
    });
    const eventNameBlock = drawer.querySelector("h2")?.parentElement;
    const description = eventNameBlock?.querySelector("p");
    if (description) description.textContent = event.description || `${event.date || "Upcoming"} · ${event.venue || "Venue to be announced"}`;
    const eventDateVenue = drawer.querySelectorAll("p");
    eventDateVenue.forEach(node => {
      if (/15 Nov 2026|Bengaluru Convention Centre/i.test(node.textContent)) {
        node.textContent = `${event.date || "Date to be announced"} · ${event.venue || "Venue to be announced"}`;
      }
    });
    const tiers = [...drawer.querySelectorAll(".ticket-tier-card")];
    const base = Math.max(0, Number(event.price) || 0);
    tiers.forEach(card => {
      const tier = card.dataset.tier;
      const isOriginalSummit = event.name === "Tech Summit 2026" && base === 499;
      const amount = tier === "vip" ? (isOriginalSummit ? 1299 : Math.round(base * 2.6))
        : tier === "student" ? (isOriginalSummit ? 199 : Math.max(49, Math.round(base * 0.4))) : base;
      card.dataset.price = String(amount);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.value = String(amount);
      const priceLabel = card.querySelector(".font-metric-price");
      if (priceLabel) priceLabel.textContent = money(amount);
    });
    const safeCopy = new Map([
      ["Live Lock Active", "Demo checkout"],
      ["Verified Host", "Sample event"],
      ["Table ID: events.price", "Sample ticket prices"],
      ["Encrypted", "Local demo only"],
      ["256-Bit SSL Secured", "No payment details collected"],
      ["Instant WhatsApp QR", "Pass preview only"],
      ["100% Refund Guarantee", "No charge in demo"],
    ]);
    const walker = document.createTreeWalker(drawer, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const text = clean(textNode.nodeValue);
      if (safeCopy.has(text)) textNode.nodeValue = safeCopy.get(text);
      else if (text === "events#TS26-LOCK") textNode.nodeValue = "LOCAL PREVIEW";
    }
    const timerLabel = [...drawer.querySelectorAll("span")].find(node => /Seat reserved for/i.test(node.textContent));
    if (timerLabel) timerLabel.textContent = "Sample checkout timer · no seats are held";
    const standard = tiers.find(card => card.dataset.tier === "standard") || tiers[0];
    if (standard) standard.click();
    const name = document.getElementById("attendeeName");
    const email = document.getElementById("attendeeEmail");
    const phone = document.getElementById("attendeePhone");
    if (name && name.value === "Arjun Sundaram") name.value = "";
    if (email && email.value === "arjun.sundaram@neuralcraft.io") email.value = "";
    if (phone && phone.value === "98450 22391") phone.value = "";
    if (name) name.placeholder = "Full name";
    [name, email].filter(Boolean).forEach(input => { input.required = true; });
    if (phone) {
      phone.required = false;
      phone.value = "";
      phone.autocomplete = "off";
      const label = drawer.querySelector('label[for="attendeePhone"]');
      if (label) label.textContent = "Phone (optional; not saved)";
    }
    const attendeeNameLabel = drawer.querySelector('label[for="attendeeName"]');
    if (attendeeNameLabel) attendeeNameLabel.textContent = "Attendee name";
    const attendeeEmailLabel = drawer.querySelector('label[for="attendeeEmail"]');
    if (attendeeEmailLabel) attendeeEmailLabel.textContent = "Email for booking confirmation";
    const method = drawer.querySelector('input[name="payment_method"]');
    if (method) method.checked = true;
    const note = document.createElement("div");
    note.className = "pe-demo-note";
    note.textContent = databaseAvailable
      ? "Booking requests are saved to PostgreSQL. No payment is processed and this is not a valid entry ticket."
      : "The database is unavailable, so this booking cannot be saved.";
    payButton.disabled = !databaseAvailable;
    const payLabel = document.getElementById("btnPayLabel");
    const updateBookingLabel = () => {
      if (payLabel) payLabel.textContent = `Save booking request · ${document.getElementById("summaryTotal")?.textContent || ""}`;
    };
    updateBookingLabel();
    document.addEventListener("click", click => {
      if (click.target.closest("#incrementBtn, #decrementBtn, .ticket-tier-card")) {
        setTimeout(updateBookingLabel, 0);
      }
    }, true);
    payButton.insertAdjacentElement("afterend", note);

    document.addEventListener("click", click => {
      if (click.target.closest("#closeDrawerBtn") || click.target.closest("#drawerBackdrop")) {
        click.preventDefault();
        click.stopImmediatePropagation();
        openRoute(ROUTES["explore-events"]);
      }
      if (click.target.closest("#paySubmitBtn")) {
        click.preventDefault();
        click.stopImmediatePropagation();
        completeBooking(event, drawer);
      }
    }, true);
  }

  async function completeBooking(event, drawer) {
    const name = document.getElementById("attendeeName");
    const email = document.getElementById("attendeeEmail");
    const phone = document.getElementById("attendeePhone");
    const selected = drawer.querySelector(".ticket-tier-card input[type=radio]:checked");
    const selectedCard = selected?.closest(".ticket-tier-card");
    const quantity = Math.min(5, Math.max(1, Number(document.getElementById("ticketQtyText")?.textContent) || 1));
    const attendeeName = clean(name?.value);
    const attendeeEmail = clean(email?.value);
    if (!attendeeName || !attendeeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendeeEmail)
      ) {
      if (!attendeeName) name?.focus();
      else email?.focus();
      notify("Enter your name and a valid email address to continue.");
      return;
    }
    if (!databaseAvailable) {
      notify("Database is unavailable. No booking was saved.");
      return;
    }
    const payButton = document.getElementById("paySubmitBtn");
    const originalLabel = payButton?.innerText || "Save booking request";
    if (payButton?.disabled) return;
    if (payButton) { payButton.disabled = true; payButton.textContent = "Saving booking…"; }
    try {
      const result = await apiRequest("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          eventId: event.id,
          attendeeName,
          attendeeEmail,
          tier: selectedCard?.dataset.tier || "standard",
          quantity,
        }),
      });
      const booking = result.booking;
      databaseBookings = [booking, ...databaseBookings.filter(item => item.id !== booking.id)];
      safeWrite(STORAGE.selected, event);
      openRoute("/booking_confirmation_qr_ticket/code.html", { ref: booking.id });
    } catch (error) {
      notify(error.message || "The booking could not be saved.");
    } finally {
      if (payButton) { payButton.disabled = false; payButton.textContent = originalLabel; }
    }
  }

  function setupConfirmation() {
    if (!page.includes("booking_confirmation_qr_ticket")) return;
    const bookings = databaseBookings;
    const booking = bookings.find(item => item.id === params.get("ref")) || bookings[0];
    const heading = document.querySelector("main h1");
    if (!heading) return;
    if (booking) {
      heading.textContent = "";
      heading.append(document.createTextNode("Booking request saved for "));
      const highlighted = document.createElement("span");
      highlighted.className = "text-primary";
      highlighted.textContent = booking.event;
      heading.appendChild(highlighted);
      const detailHeading = [...document.querySelectorAll("main h2")].find(node => /Tech Summit 2026/i.test(node.textContent));
      if (detailHeading) detailHeading.textContent = booking.event;
      const emailLine = document.querySelector("main h1")?.parentElement?.querySelector("p");
      if (emailLine) emailLine.innerHTML = `Your booking request is saved for <strong>${escapeHtml(booking.attendeeEmail)}</strong>. No payment was collected.`;
      document.querySelectorAll("main").forEach(main => {
        main.querySelectorAll("span,code,strong").forEach(node => {
          if (/PE-984210|TS26-8942-ELITE|ORD-2025-8942/i.test(node.textContent)) node.textContent = booking.id;
          if (/arjun sundaram/i.test(node.textContent)) node.textContent = booking.attendeeName;
          if (/₹544/.test(node.textContent)) node.textContent = money(booking.total);
        });
      });
      const note = document.createElement("p");
      note.className = "pe-demo-note";
      note.textContent = "Saved to the database with payment required. No payment was collected; this is not a ticket for venue entry.";
      heading.insertAdjacentElement("afterend", note);
    } else {
      const main = document.querySelector("main");
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        walker.currentNode.nodeValue = walker.currentNode.nodeValue
          .replaceAll("arjun.sundaram@neuralcraft.io", "demo@example.com")
          .replaceAll("Arjun Sundaram", "Demo Attendee")
          .replaceAll("PE-984210", "SAMPLE-ONLY")
          .replaceAll("TS26-8942-ELITE", "SAMPLE-ONLY")
          .replaceAll("ORD-2025-8942", "SAMPLE-ONLY");
      }
      const note = document.createElement("p");
      note.className = "pe-demo-note";
      note.textContent = "No booking is linked to this browser session. Choose an event and save a booking request to see it here.";
      heading.insertAdjacentElement("afterend", note);
    }
    document.getElementById("downloadPdfBtn")?.addEventListener("click", () => window.print());
    const bookingActions = [...document.querySelectorAll("main button")];
    bookingActions.forEach(button => {
      if (/share pass/i.test(button.innerText)) button.addEventListener("click", () => shareBooking(booking));
      if (/apple wallet|google wallet/i.test(button.innerText)) button.addEventListener("click", () =>
        notify("Wallet passes require a signed wallet integration, which this demo does not use."));
      if (/calendar_add_on|add to calendar/i.test(button.innerText)) button.addEventListener("click", () => downloadCalendar(booking || CATALOG[0]));
    });
    document.querySelectorAll("main a[href=\"#\"]").forEach(anchor => {
      if (/google calendar|apple calendar|outlook live/i.test(anchor.innerText)) {
        anchor.href = "#add-calendar";
        anchor.addEventListener("click", event => { event.preventDefault(); downloadCalendar(booking || CATALOG[0]); });
      }
    });
  }

  function setupWallet() {
    const bookings = databaseBookings;
    const main = document.querySelector("main > div");
    if (!main) return;
    const replaceCopy = (pattern, value) => {
      main.querySelectorAll("span,p,h2,h3,strong").forEach(node => {
        if (pattern.test(clean(node.textContent))) node.textContent = value;
      });
    };
    replaceCopy(/Attendee Vault\s*•\s*Verified Tier/i, "DATABASE WALLET • SAMPLE PASSES");
    replaceCopy(/Manage your registered event passes/i, "This wallet shows booking requests saved for this browser session. Sample passes are not valid for venue entry.");
    replaceCopy(/^NFC Badge Ready$/i, "Preview only");
    replaceCopy(/^2 Upcoming$/i, `${bookings.length} Booking requests`);
    replaceCopy(/^8 Gatherings$/i, "Sample history");
    replaceCopy(/^Verified ID$/i, "Not connected");
    replaceCopy(/Aadhar\s*&\s*Gov ID/i, "No identity check connected");
    replaceCopy(/^1 Reassigned$/i, "Demo only");
    const panel = document.createElement("section");
    panel.className = "pe-booking-panel";
    panel.innerHTML = `<h2>Your database bookings</h2><p style="margin:0 0 12px;color:#c7c4d7;font:13px/1.5 Manrope,system-ui,sans-serif">Booking requests are scoped to this browser session. No payment provider or venue validation is connected. Sample passes shown elsewhere are not valid for admission.</p>${bookings.length
      ? `<div class="pe-booking-list">${bookings.map(booking => `<article class="pe-booking-item"><strong style="font:600 16px Outfit,system-ui,sans-serif">${escapeHtml(booking.event)}</strong><p style="margin:8px 0;color:#c7c4d7;font:12px/1.5 Manrope,system-ui,sans-serif">${escapeHtml(booking.date || "Date to be announced")} · ${escapeHtml(booking.venue || "Venue to be announced")}<br>${escapeHtml(booking.attendeeName)} · ${booking.quantity} request${booking.quantity === 1 ? "" : "s"}<br>${money(booking.total)} · ${escapeHtml(booking.id)} · Payment required</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-print-booking="${escapeHtml(booking.id)}" style="padding:8px 10px;border:1px solid #ffffff20;border-radius:5px;background:#282933;color:#e1e1ef;cursor:pointer">Print request</button><button type="button" data-share-booking="${escapeHtml(booking.id)}" style="padding:8px 10px;border:1px solid #ffffff20;border-radius:5px;background:#282933;color:#e1e1ef;cursor:pointer">Share reference</button></div></article>`).join("")}</div>`
      : `<p style="margin:0;color:#c7c4d7;font:13px/1.5 Manrope,system-ui,sans-serif">No booking requests have been made in this browser session yet.</p>`}`;
    const intro = main.firstElementChild;
    main.insertBefore(panel, intro?.nextElementSibling || null);
    panel.querySelectorAll("[data-print-booking]").forEach(button => button.addEventListener("click", () => window.print()));
    panel.querySelectorAll("[data-share-booking]").forEach(button => button.addEventListener("click", () => {
      const found = bookings.find(item => item.id === button.dataset.shareBooking);
      shareBooking(found);
    }));
    const upcomingTab = [...main.querySelectorAll("button")].find(button => /^Upcoming/i.test(clean(button.innerText)));
    const pastTab = [...main.querySelectorAll("button")].find(button => /^Past Events/i.test(clean(button.innerText)));
    const transferredTab = [...main.querySelectorAll("button")].find(button => /^Transferred/i.test(clean(button.innerText)));
    if (upcomingTab) upcomingTab.textContent = `Upcoming (${bookings.length})`;
    if (pastTab) pastTab.textContent = "Past Events (sample)";
    if (transferredTab) transferredTab.textContent = "Transferred (0)";
    const walletSections = [
      [upcomingTab, [...main.querySelectorAll("h2,h3")].find(heading => /Next Priority Admission/i.test(heading.textContent))],
      [pastTab, [...main.querySelectorAll("h2,h3")].find(heading => /Past Attendances/i.test(heading.textContent))],
    ];
    walletSections.forEach(([tab, heading]) => tab?.addEventListener("click", () => {
      heading?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    transferredTab?.addEventListener("click", () => notify("No transfers are connected in this local demo."));
    const search = main.querySelector('input[placeholder^="Filter by event"]');
    const filterWallet = () => {
      const query = clean(search?.value).toLowerCase();
      main.querySelectorAll("h3").forEach(heading => {
        const card = heading.closest(".bg-surface-container");
        if (card) card.style.display = !query || card.innerText.toLowerCase().includes(query) ? "" : "none";
      });
      panel.querySelectorAll(".pe-booking-item").forEach(card => {
        card.style.display = !query || card.innerText.toLowerCase().includes(query) ? "" : "none";
      });
    };
    search?.addEventListener("input", filterWallet);
  }

  function shareBooking(booking) {
    if (!booking) { notify("There is no saved booking to share yet."); return; }
    const text = `PulseEvents booking request: ${booking.event} · ${booking.id}. Payment is required; this is not a venue-valid ticket.`;
    if (navigator.share) navigator.share({ title: "PulseEvents demo booking", text }).catch(() => {});
    else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text)
      .then(() => notify("Demo booking reference copied."))
      .catch(() => notify(text));
    else notify(text);
  }

  function downloadCalendar(event) {
    const title = event.event || event.name || "PulseEvents experience";
    const dateText = event.date || "";
    const parsed = Date.parse(dateText);
    const start = Number.isFinite(parsed) ? new Date(parsed) : new Date(Date.now() + 86400000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const stamp = date => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const file = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PulseEvents//Demo Calendar//EN",
      "BEGIN:VEVENT", `UID:${escapeIcs(event.id || `${title}-${start.getTime()}`)}`,
      `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeIcs(title)}`, `LOCATION:${escapeIcs(event.venue || "")}`,
      "DESCRIPTION:PulseEvents event listing. Confirm details with the organizer.",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([file], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "pulse-event"}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("Calendar file downloaded.");
  }

  function escapeIcs(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function setupDelegatedActions() {
    document.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const bookButton = target.closest("[data-book-event]");
      if (bookButton) {
        const item = canonicalEvent(bookButton.dataset.bookEvent);
        if (item) routeToCheckout(item);
        return;
      }
      const button = target.closest("button");
      if (button && /save |bookmark/i.test(button.getAttribute("aria-label") || "")) {
        setTimeout(() => {
          const favorites = safeRead(STORAGE.favorites, []);
          const title = button.getAttribute("aria-label").replace(/^(save|bookmark)\s+/i, "");
          const icon = button.querySelector(".material-symbols-outlined");
          const saved = Boolean(icon && (icon.classList.contains("text-error") || icon.classList.contains("text-secondary")));
          const next = saved ? [...new Set([...favorites, title])] : favorites.filter(item => item !== title);
          safeWrite(STORAGE.favorites, next);
        }, 0);
      }
      if (button && /book now|get tickets|reserve spot|preview booking/i.test(clean(button.innerText).toLowerCase())) {
        const card = button.closest("article");
        if (card) {
          event.preventDefault();
          routeToCheckout(eventFromCard(card));
          return;
        }
      }
      if (button && /subscribe/i.test(button.innerText)) {
        event.preventDefault();
        const input = button.parentElement?.querySelector('input[type="email"]')
          || button.closest("form")?.querySelector('input[type="email"]');
        if (!input || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(input.value))) {
          input?.focus();
          notify("Enter a valid email address to subscribe.");
          event.preventDefault();
          return;
        }
        const email = clean(input.value).toLowerCase();
        button.disabled = true;
        apiRequest("/api/subscriptions", { method: "POST", body: JSON.stringify({ email }) })
          .then(() => {
            input.value = "";
            notify("Email saved to the subscriber list. Newsletter sending is not connected.");
          })
          .catch(error => notify(error.message || "The email could not be saved."))
          .finally(() => { button.disabled = false; });
      }
      const anchor = target.closest('a[href="#"]');
      if (anchor) {
        const label = clean(anchor.innerText);
        if (/view all my tickets|my tickets/i.test(label)) { event.preventDefault(); openRoute(ROUTES["my-tickets"]); }
        else if (/explore more events|view all \d+ experiences/i.test(label)) { event.preventDefault(); openRoute(ROUTES["explore-events"]); }
        else if (/electronic & club|live concerts|art & gallery|intimate acoustic|culinary/i.test(label)) { event.preventDefault(); openRoute(ROUTES["explore-events"]); }
        else if (/host an experience|create event/i.test(label)) { event.preventDefault(); openRoute(ROUTES["create-event"]); }
      }
      if (button) {
        const label = clean(button.innerText).toLowerCase();
        if (button.getAttribute("aria-label") === "User Profile Menu") {
          event.preventDefault();
          let menu = document.getElementById("pulse-profile-menu");
          if (menu) { menu.remove(); return; }
          menu = document.createElement("div");
          menu.id = "pulse-profile-menu";
          menu.style.cssText = "position:fixed;z-index:1000;top:72px;right:20px;display:grid;min-width:190px;padding:8px;border:1px solid #ffffff1a;border-radius:8px;background:#1d1f29;box-shadow:0 14px 40px #0008";
          menu.innerHTML = `<a href="${ROUTES["my-tickets"]}" style="padding:10px;color:#e1e1ef;text-decoration:none;font:500 13px Manrope,system-ui,sans-serif">My Tickets</a><a href="${ROUTES["create-event"]}" style="padding:10px;color:#e1e1ef;text-decoration:none;font:500 13px Manrope,system-ui,sans-serif">Create an event</a><button type="button" data-close-profile style="padding:10px;border:0;background:none;text-align:left;color:#c7c4d7;cursor:pointer;font:500 13px Manrope,system-ui,sans-serif">Close</button>`;
          document.body.appendChild(menu);
          return;
        }
        if (button.hasAttribute("data-close-profile")) {
          document.getElementById("pulse-profile-menu")?.remove();
          return;
        }
        if (/view qr pass|qr code_scanner/.test(label)) showPassDialog();
        else if (/add to apple wallet|add to google wallet|nfc badge ready/.test(label)) notify("Wallet passes need a signed Apple or Google Wallet integration; none is connected.");
        else if (/transfer pass|\btransfer\b/.test(label)) notify("Pass transfers are not connected in this local demo.");
        else if (/download.*(pdf|ticket)|invoice pdf|view invoice|download official tax invoice/i.test(label)) {
          event.preventDefault();
          if (page.includes("booking_confirmation")) window.print();
          else notify("Open a booking confirmation to print a demo receipt.");
        } else if (/sync passes/i.test(label)) notify("All demo passes saved in this browser are already shown below.");
        else if (/contact concierge|helpdesk|admission guarantee faq/i.test(label)) notify("Support messaging is not connected in this preview.");
      }
    });
  }

  function showPassDialog() {
    const booking = databaseBookings[0];
    const backdrop = document.createElement("div");
    backdrop.className = "pe-pass-backdrop";
    const dialog = document.createElement("section");
    dialog.className = "pe-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const reference = booking?.id || "SAMPLE-PASS";
    dialog.innerHTML = `<h2>Pass preview</h2><p>This is a local demo reference, not a scannable or venue-valid ticket.</p><div style="margin:20px auto;padding:18px;width:min(250px,90%);text-align:center;border-radius:8px;background:#e1e1ef;color:#11131c"><span style="display:block;font-size:32px;letter-spacing:4px">▦ ▣ ▦</span><strong style="display:block;margin-top:12px">${escapeHtml(reference)}</strong></div><button type="button" data-close-pass>Close</button>`;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop || event.target.closest("[data-close-pass]")) backdrop.remove();
    });
  }

  function restoreFavorites() {
    const favorites = safeRead(STORAGE.favorites, []);
    document.querySelectorAll('button[aria-label^="Save"],button[aria-label^="Bookmark"]').forEach(button => {
      const title = button.getAttribute("aria-label").replace(/^(save|bookmark)\s+/i, "");
      if (!favorites.includes(title)) return;
      const icon = button.querySelector(".material-symbols-outlined");
      if (icon?.textContent.trim() === "bookmark") button.classList.add("text-secondary");
      else button.classList.add("text-error");
    });
  }

  async function initialize() {
    document.documentElement.dataset.pulseReady = "loading";
    installStyles();
    setupBrandAndNavigation();
    try {
      const eventResult = await apiRequest("/api/events");
      const bookingResult = await apiRequest("/api/bookings");
      if (!Array.isArray(eventResult.events) || !Array.isArray(bookingResult.bookings)) {
        throw new Error("The database returned an invalid response.");
      }
      databaseEvents = eventResult.events;
      databaseBookings = bookingResult.bookings;
      databaseAvailable = true;
    } catch (error) {
      console.error("PulseEvents database request failed:", error.message);
      databaseEvents = [...CATALOG];
      databaseBookings = [];
      databaseAvailable = false;
    }
    if (page.includes("explore_events_ticketing") || page.includes("add_event_modal_sql_schema_form")) {
      document.querySelectorAll("main span").forEach(node => {
        const text = clean(node.textContent);
        if (/Database Synced:|public\.events|Active Catalog Query/i.test(text)) {
          node.textContent = "DATABASE CATALOG · sample listings";
        } else if (/Real-Time Feed Latency/i.test(text)) {
          node.textContent = databaseAvailable ? "DATABASE CONNECTED" : "DATABASE OFFLINE";
        } else if (/Verified Primary Records/i.test(text)) {
          node.style.display = "none";
          if (node.previousElementSibling?.textContent.trim() === "•") node.previousElementSibling.style.display = "none";
        }
      });
      const copyWalker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
      while (copyWalker.nextNode()) {
        copyWalker.currentNode.nodeValue = copyWalker.currentNode.nodeValue
          .replace(/Database Item #\d+/gi, "Sample Event")
          .replace(/1,200\+/g, "0")
          .replace(/3,500\+/g, "0");
      }
      document.querySelectorAll("main article").forEach(article => {
        const title = clean(article.querySelector("h2,h3")?.textContent).toLowerCase();
        if (!CATALOG.some(item => item.name.toLowerCase() === title)) return;
        const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          walker.currentNode.nodeValue = walker.currentNode.nodeValue
            .replace(/CATALOG SCHEMA/gi, "SAMPLE EVENT")
            .replace(/Registered Attendees/gi, "Sample attendee data")
            .replace(/Capacity Reserved/gi, "Sample capacity")
            .replace(/Attendee Cap/gi, "Sample capacity")
            .replace(/\b[\d,]+\s*\/\s*[\d,]+\b/g, "Sample only")
            .replace(/\b[\d,]+\s*\+/g, "Sample");
        }
      });
      const schemaTitle = [...document.querySelectorAll("main span")].find(node => /^Schema Integrity$/i.test(clean(node.textContent)));
      const schemaNote = schemaTitle?.parentElement?.parentElement?.querySelector("p");
      if (schemaNote) schemaNote.textContent = databaseAvailable
        ? "Events are loaded from PostgreSQL. New listings are shared with visitors."
        : "Database connection failed. Sample cards are read-only until it returns.";
      document.querySelectorAll("main p").forEach(node => {
        if (/Synchronized directly with verified venue schedules/i.test(node.textContent)) {
          node.textContent = "Browse sample events and community listings stored in the project database.";
        }
      });
      document.querySelectorAll("main .font-metric-price").forEach(node => {
        const cities = new Set(databaseEvents.map(event => {
          const venue = clean(event.venue).toLowerCase();
          if (/bengaluru|bangalore/.test(venue)) return "Bengaluru";
          if (/delhi/.test(venue)) return "Delhi";
          if (/mumbai/.test(venue)) return "Mumbai";
          if (/goa|vagator/.test(venue)) return "Goa";
          return venue.split(",").pop() || "Other";
        }));
        const values = new Map([
          ["500+", String(databaseEvents.filter(event => event.isSample).length)],
          ["25+", String(cities.size)],
          ["100k+", String(databaseBookings.length)],
        ]);
        if (values.has(clean(node.textContent))) node.textContent = values.get(clean(node.textContent));
      });
      document.querySelectorAll("main .font-label-sm").forEach(node => {
        if (/^curations$/i.test(clean(node.textContent))) node.textContent = "Sample Events";
        if (/^attendees$/i.test(clean(node.textContent))) node.textContent = "Session Bookings";
      });
    }
    showDatabaseStatus();
    addCreatedEventCards();
    setupFilters();
    setupEventForm();
    setupCheckout();
    setupConfirmation();
    setupWallet();
    showCalendar();
    setupDelegatedActions();
    restoreFavorites();
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      document.querySelector(".pe-calendar-backdrop, .pe-pass-backdrop")?.remove();
      const modal = document.getElementById("createEventModal");
      if (modal && getComputedStyle(modal).display !== "none") modal.style.display = "none";
    });
    if (page.includes("booking_confirmation") && !databaseBookings.length) {
      const toast = document.getElementById("toastNotification");
      if (toast) toast.classList.add("hidden");
    }
    document.documentElement.dataset.pulseReady = databaseAvailable ? "yes" : "offline";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
