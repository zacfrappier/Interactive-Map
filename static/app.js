// Stores the current map metadata that Flask placed into the page before app.js loaded.
let currentMap = window.CURRENT_MAP;

// Holds the Leaflet map object after it is created.
let map = null;

// Holds the current Leaflet image overlay for the map image.
let imageOverlay = null;

// Stores the ID of the pin currently being moved, or null if no pin is being moved.
let movingPinId = null;

// Stores Leaflet marker objects by pin ID so they can be updated or removed later.
const markerById = new Map();

// Gets the sidebar container where pin cards are displayed.
const pinList = document.getElementById("pinList");

// Gets the “No pins yet” message element.
const emptyState = document.getElementById("emptyState");

// Gets the button used to clear all current pins.
const clearPinsBtn = document.getElementById("clearPinsBtn");

// Gets the map upload form.
const mapUploadForm = document.getElementById("mapUploadForm");

// Gets the file input where the user selects a new map image.
const mapFileInput = document.getElementById("mapFileInput");

// Gets the status text that shows upload progress or current map name.
const mapUploadStatus = document.getElementById("mapUploadStatus");


// Returns the Leaflet bounds using the current map image height and width.
function getMapBounds() {
  return [[0, 0], [currentMap.height, currentMap.width]];
}


// Removes the existing Leaflet map and clears marker references before rebuilding.
function destroyExistingMap() {
  if (map) {
    map.remove();
    map = null;
  }

  imageOverlay = null;
  markerById.clear();
}


// Creates the Leaflet image map, adds the image overlay, and attaches the click handler.
function initializeMap() {
  const bounds = getMapBounds();

  map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 2,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
  });

  imageOverlay = L.imageOverlay(currentMap.url, bounds).addTo(map);

  map.fitBounds(bounds);

  setTimeout(() => {
    map.invalidateSize();
    map.fitBounds(bounds);
  }, 100);

  map.on("click", handleMapClick);
}


// Rebuilds the map after the current map image changes.
function rebuildMap() {
  exitMoveMode();
  destroyExistingMap();
  initializeMap();
}


// Creates a custom colored circular Leaflet marker icon.
function createMarkerIcon(color) {
  return L.divIcon({
    className: "custom-pin-wrapper",
    html: `<div style="
      width: 18px;
      height: 18px;
      background: ${color};
      border: 2px solid white;
      border-radius: 999px;
      box-shadow: 0 0 8px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}


// Adds a marker to the map for a pin and stores it by pin ID.
function addMarker(pin) {
  const marker = L.marker([pin.y, pin.x], {
    icon: createMarkerIcon(pin.color),
  }).addTo(map);

  marker.bindPopup(`<strong>${pin.name}</strong><br>${pin.description || "No description"}`);

  markerById.set(pin.id, marker);
}


// Updates an existing marker’s position, color, and popup text.
function updateMarker(pin) {
  const marker = markerById.get(pin.id);

  if (!marker) return;

  marker.setLatLng([pin.y, pin.x]);
  marker.setIcon(createMarkerIcon(pin.color));
  marker.bindPopup(`<strong>${pin.name}</strong><br>${pin.description || "No description"}`);
}


// Removes one marker from the map by its pin ID.
function removeMarker(pinId) {
  const marker = markerById.get(pinId);

  if (!marker) return;

  map.removeLayer(marker);
  markerById.delete(pinId);
}


// Removes every marker from the map and clears the marker lookup table.
function clearAllMarkers() {
  for (const marker of markerById.values()) {
    map.removeLayer(marker);
  }

  markerById.clear();
}


// Builds a small colored SVG cursor for move mode.
function buildMoveCursor(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="7" fill="${color}" stroke="white" stroke-width="2"/>
    </svg>
  `;

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 14 14, crosshair`;
}


// Sets the map cursor to the colored move cursor.
function setMoveCursor(color) {
  const mapEl = document.getElementById("map");

  if (mapEl) {
    mapEl.style.cursor = buildMoveCursor(color);
  }
}


// Resets the map cursor back to normal.
function resetMapCursor() {
  const mapEl = document.getElementById("map");

  if (mapEl) {
    mapEl.style.cursor = "";
  }
}


// Cancels move mode and resets all move buttons back to normal.
function exitMoveMode() {
  movingPinId = null;
  resetMapCursor();

  document.querySelectorAll(".move-btn").forEach((btn) => {
    btn.classList.remove("move-active");
    btn.textContent = "Move";
  });
}


// Shows or hides the sidebar empty-state message.
function setEmptyStateVisible(visible) {
  if (!emptyState) return;

  emptyState.style.display = visible ? "block" : "none";
}


// Clears the pin sidebar and restores the empty-state message.
function clearPinUI() {
  pinList.innerHTML = "";
  pinList.appendChild(emptyState);
  setEmptyStateVisible(true);
}


// Replaces all current map markers and sidebar pin cards with a new pin list.
function replaceCurrentPins(pins) {
  exitMoveMode();
  clearAllMarkers();
  clearPinUI();

  if (!pins.length) {
    setEmptyStateVisible(true);
    return;
  }

  pins.forEach((pin) => {
    addMarker(pin);
    addPinToUI(pin);
  });
}


// Sends a PATCH request to update one pin on the Flask backend.
async function patchPin(pinId, payload) {
  const res = await fetch(`/api/pins/${pinId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Pin update failed");
  }

  return data;
}


// Sends a DELETE request to remove one pin from the Flask backend.
async function deletePin(pinId) {
  const res = await fetch(`/api/pins/${pinId}`, {
    method: "DELETE",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Pin delete failed");
  }

  return data;
}


// Sends a DELETE request to clear all pins from the Flask backend.
async function clearPins() {
  const res = await fetch("/api/pins", {
    method: "DELETE",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Clear pins failed");
  }

  return data;
}


// Sends the selected image file to Flask using FormData.
async function uploadMapFile(file) {
  const formData = new FormData();

  formData.append("map_file", file);

  const res = await fetch("/api/map/upload", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Map upload failed");
  }

  return data;
}


// Loads the current backend pins and renders them on the map and sidebar.
async function loadPins() {
  const res = await fetch("/api/pins");
  const pins = await res.json();

  replaceCurrentPins(pins);
}


// Builds one sidebar card for a pin, including edit, color, description, remove, and move controls.
function makePinCard(pin) {
  const card = document.createElement("div");
  card.className = "pin-card";
  card.dataset.pinId = String(pin.id);

  const row = document.createElement("div");
  row.className = "pin-row";

  const leftGroup = document.createElement("div");
  leftGroup.style.display = "flex";
  leftGroup.style.alignItems = "center";
  leftGroup.style.gap = "8px";

  const preview = document.createElement("div");
  preview.className = "pin-preview";
  preview.style.background = pin.color;

  const nameEl = document.createElement("div");
  nameEl.className = "pin-name";
  nameEl.textContent = pin.name;

  // Lets the user rename a pin and syncs that change with Flask.
  nameEl.addEventListener("click", async () => {
    const newName = prompt("Enter a name for this pin:", pin.name);

    if (newName === null) return;

    const trimmed = newName.trim();

    if (!trimmed) return;

    try {
      const data = await patchPin(pin.id, { name: trimmed });

      pin.name = data.pin.name;
      nameEl.textContent = pin.name;
      updateMarker(pin);
    } catch (err) {
      alert(err.message);
    }
  });

  leftGroup.appendChild(preview);
  leftGroup.appendChild(nameEl);
  row.appendChild(leftGroup);
  card.appendChild(row);

  const meta = document.createElement("div");
  meta.className = "pin-meta";
  meta.textContent = `x: ${pin.x.toFixed(1)}, y: ${pin.y.toFixed(1)}`;
  card.appendChild(meta);

  const controls = document.createElement("div");
  controls.className = "pin-controls";

  const colorField = document.createElement("div");
  colorField.className = "pin-field";

  const colorLabel = document.createElement("label");
  colorLabel.textContent = "Pin Color";

  const colorSelect = document.createElement("select");

  const colors = [
    { value: "gold", label: "Gold" },
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "purple", label: "Purple" },
    { value: "white", label: "White" },
  ];

  // Creates the dropdown options for available pin colors.
  colors.forEach((color) => {
    const option = document.createElement("option");

    option.value = color.value;
    option.textContent = color.label;

    if (color.value === pin.color) {
      option.selected = true;
    }

    colorSelect.appendChild(option);
  });

  // Updates the pin color in Flask and on the map.
  colorSelect.addEventListener("change", async () => {
    try {
      const data = await patchPin(pin.id, { color: colorSelect.value });

      pin.color = data.pin.color;
      preview.style.background = pin.color;
      updateMarker(pin);

      if (movingPinId === pin.id) {
        setMoveCursor(pin.color);
      }
    } catch (err) {
      alert(err.message);
    }
  });

  colorField.appendChild(colorLabel);
  colorField.appendChild(colorSelect);

  const descriptionField = document.createElement("div");
  descriptionField.className = "pin-field";

  const descriptionLabel = document.createElement("label");
  descriptionLabel.textContent = "Description";

  const descriptionBox = document.createElement("textarea");
  descriptionBox.placeholder = "Add a description for this pin...";
  descriptionBox.value = pin.description || "";

  // Updates the pin description in Flask and refreshes the marker popup.
  descriptionBox.addEventListener("change", async () => {
    try {
      const data = await patchPin(pin.id, { description: descriptionBox.value.trim() });

      pin.description = data.pin.description;
      updateMarker(pin);
    } catch (err) {
      alert(err.message);
    }
  });

  descriptionField.appendChild(descriptionLabel);
  descriptionField.appendChild(descriptionBox);

  const actionRow = document.createElement("div");
  actionRow.className = "pin-action-row";

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn";
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";

  // Deletes the pin from Flask, removes its marker, and removes its sidebar card.
  removeBtn.addEventListener("click", async () => {
    try {
      await deletePin(pin.id);

      removeMarker(pin.id);
      card.remove();

      if (!pinList.querySelector(".pin-card")) {
        setEmptyStateVisible(true);
      }

      if (movingPinId === pin.id) {
        exitMoveMode();
      }
    } catch (err) {
      alert(err.message);
    }
  });

  const moveBtn = document.createElement("button");
  moveBtn.className = "btn move-btn";
  moveBtn.type = "button";
  moveBtn.textContent = "Move";

  // Enables move mode so the next map click repositions this pin.
  moveBtn.addEventListener("click", () => {
    if (movingPinId === pin.id) {
      exitMoveMode();
      return;
    }

    exitMoveMode();
    movingPinId = pin.id;
    moveBtn.classList.add("move-active");
    moveBtn.textContent = "Click map...";
    setMoveCursor(pin.color);
  });

  actionRow.appendChild(removeBtn);
  actionRow.appendChild(moveBtn);

  controls.appendChild(colorField);
  controls.appendChild(descriptionField);
  controls.appendChild(actionRow);
  card.appendChild(controls);

  return card;
}


// Adds a pin card to the sidebar.
function addPinToUI(pin) {
  setEmptyStateVisible(false);

  const card = makePinCard(pin);

  pinList.appendChild(card);
}


// Handles map clicks by either creating a new pin or moving the selected pin.
async function handleMapClick(event) {
  const y = event.latlng.lat;
  const x = event.latlng.lng;

  if (movingPinId !== null) {
    try {
      const data = await patchPin(movingPinId, { x, y });
      const updatedPin = data.pin;

      updateMarker(updatedPin);

      const existingCard = pinList.querySelector(`[data-pin-id="${updatedPin.id}"]`);

      if (existingCard) {
        existingCard.querySelector(".pin-meta").textContent =
          `x: ${updatedPin.x.toFixed(1)}, y: ${updatedPin.y.toFixed(1)}`;
      }

      exitMoveMode();
      return;
    } catch (err) {
      alert(err.message);
      exitMoveMode();
      return;
    }
  }

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

  addMarker(data.pin);
  addPinToUI(data.pin);
}


// Handles the Clear Pins button by clearing backend pins and resetting the map/sidebar UI.
clearPinsBtn.addEventListener("click", async () => {
  try {
    await clearPins();

    exitMoveMode();
    clearAllMarkers();
    clearPinUI();
  } catch (err) {
    alert(err.message);
  }
});


// Handles map uploads by sending the image to Flask, rebuilding the map, and clearing current pins.
mapUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = mapFileInput.files[0];

  if (!file) {
    alert("Please choose an image file first.");
    return;
  }

  try {
    mapUploadStatus.textContent = "Uploading map...";

    const data = await uploadMapFile(file);

    currentMap = data.map;
    mapUploadStatus.textContent = `Current map: ${currentMap.filename}`;

    rebuildMap();
    clearPinUI();
    mapFileInput.value = "";
  } catch (err) {
    mapUploadStatus.textContent = "Upload failed.";
    alert(err.message);
  }
});


// Creates the map when the page first loads.
initializeMap();

// Loads any current backend pins when the page first loads.
loadPins();