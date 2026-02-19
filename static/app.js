// ---- Image Map Settings ----
// Put your image in /static and set the correct pixel size here:
const IMAGE_URL = "/static/eldenringmap.jpg";   // <-- change if needed
const IMAGE_WIDTH = 2000;               // <-- set to your image width (px)
const IMAGE_HEIGHT = 7049;              // <-- set to your image height (px)

// Leaflet "simple CRS" so we use pixel coords
const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -5,
});

const bounds = [[0, 0], [IMAGE_HEIGHT, IMAGE_WIDTH]];
L.imageOverlay(IMAGE_URL, bounds).addTo(map);
map.fitBounds(bounds);

// Keep markers by pin id
const markerById = new Map();

// Sidebar elements
const pinList = document.getElementById("pinList");
const emptyState = document.getElementById("emptyState");

function setEmptyStateVisible(visible) {
  if (!emptyState) return;
  emptyState.style.display = visible ? "block" : "none";
}

function makePinCard(pin) {
  const card = document.createElement("div");
  card.className = "pin-card";
  card.dataset.pinId = String(pin.id);

  const row = document.createElement("div");
  row.className = "pin-row";

  const nameEl = document.createElement("div");
  nameEl.className = "pin-name";
  nameEl.textContent = pin.name;

  // Click-to-edit name
  nameEl.addEventListener("click", async () => {
    const newName = prompt("Enter a name for this pin:", nameEl.textContent || "");
    if (newName === null) return; // cancelled
    const trimmed = newName.trim();
    if (!trimmed) return;

    const res = await fetch(`/api/pins/${pin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (!res.ok) {
      const msg = await res.text();
      alert("Rename failed: " + msg);
      return;
    }

    nameEl.textContent = trimmed;

    // update marker popup too
    const m = markerById.get(pin.id);
    if (m) m.bindPopup(trimmed);
  });

  row.appendChild(nameEl);
  card.appendChild(row);

  const meta = document.createElement("div");
  meta.className = "pin-meta";
  meta.textContent = `x: ${pin.x.toFixed(1)}, y: ${pin.y.toFixed(1)}`;
  card.appendChild(meta);

  return card;
}

function addMarker(pin) {
  const m = L.marker([pin.y, pin.x]).addTo(map);
  m.bindPopup(pin.name);
  markerById.set(pin.id, m);
}

function addPinToUI(pin) {
  setEmptyStateVisible(false);
  const card = makePinCard(pin);
  pinList.appendChild(card);
}

async function loadPins() {
  const res = await fetch("/api/pins");
  const pins = await res.json();

  pinList.innerHTML = "";
  pinList.appendChild(emptyState);

  if (!pins.length) {
    setEmptyStateVisible(true);
    return;
  }
  setEmptyStateVisible(false);

  pins.forEach((p) => {
    addMarker(p);
    addPinToUI(p);
  });
}

// Create pin on map click
map.on("click", async (e) => {
  const y = e.latlng.lat;
  const x = e.latlng.lng;

  const res = await fetch("/api/pins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  });

  const data = await res.json();
  if (!data.ok) {
    alert("Failed to create pin");
    return;
  }

  const pin = data.pin;
  addMarker(pin);
  addPinToUI(pin);
});

// Initial load
loadPins();