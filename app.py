from __future__ import annotations
# Delays evaluation of type hints so annotations are easier to use and safer when classes reference each other.

from dataclasses import dataclass
# Imports the dataclass decorator, which automatically creates boilerplate methods for simple data-holding classes.

from typing import Dict, List, Optional
# Imports type-hint helpers used to describe dictionaries, lists, and values that may be None.

from pathlib import Path
# Imports a modern file-path object used to safely build and manage folders/files like the uploads directory.

from uuid import uuid4
# Imports a function that creates highly unique random IDs, useful for preventing uploaded files from overwriting each other.

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    redirect,
    url_for,
    session,
    send_from_directory,
)
# Imports Flask tools for creating the app, rendering pages, reading requests, returning JSON, redirecting users, tracking sessions, and serving uploaded files.

from werkzeug.security import generate_password_hash, check_password_hash
# Imports password utilities used to safely hash passwords during registration and verify them during login.

from werkzeug.utils import secure_filename
# Imports a utility that sanitizes uploaded filenames before saving them.

from PIL import Image
# Imports Pillow's image tool so the app can read uploaded map dimensions.


app = Flask(__name__)
# Creates the Flask application instance.

app.secret_key = "dev-secret-change-me"
# Sets the secret key Flask uses to securely sign session data during local development.


BASE_DIR = Path(__file__).resolve().parent
# Gets the absolute folder path containing app.py.

UPLOAD_FOLDER = BASE_DIR / "uploads"
# Defines the folder where uploaded map images will be saved.

UPLOAD_FOLDER.mkdir(exist_ok=True)
# Creates the uploads folder if it does not already exist.

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
# Defines which image file extensions are allowed for map uploads.


@dataclass
class Pin:
    # Defines the structure of a pin object stored by the backend.
    id: int
    x: float
    y: float
    name: str
    color: str
    description: str


PINS: List[Pin] = []
# Stores the current active pins in memory while the Flask server is running.

NEXT_PIN_ID = 1
# Tracks the next unique numeric ID to assign when a new pin is created.

USERS: Dict[str, str] = {}
# Stores usernames mapped to password hashes in memory while the Flask server is running.


CURRENT_MAP = {
    "filename": "eldenringmap.jpg",
    "url": "/static/eldenringmap.jpg",
    "width": 6780,
    "height": 7049,
    "source": "static",
}
# Stores metadata for the map image currently displayed in the browser.


def current_user() -> Optional[str]:
    # Returns the logged-in username from the session, or None if no user is logged in.
    return session.get("username")


def pin_to_dict(pin: Pin) -> dict:
    # Converts a Pin object into a JSON-friendly dictionary for API responses.
    return {
        "id": pin.id,
        "x": pin.x,
        "y": pin.y,
        "name": pin.name,
        "color": pin.color,
        "description": pin.description,
    }


def allowed_image_file(filename: str) -> bool:
    # Checks whether an uploaded filename has one of the allowed image extensions.
    if "." not in filename:
        return False

    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_IMAGE_EXTENSIONS


@app.get("/")
def home():
    # Renders the main home page and passes login state plus current map metadata into the template.
    return render_template(
        "home.html",
        username=current_user(),
        current_map=CURRENT_MAP,
    )


@app.get("/login")
def login():
    # Renders the login page with no error message on first load.
    return render_template("login.html", username=current_user(), error=None)


@app.post("/login")
def login_post():
    # Processes submitted login form data and either logs the user in or re-renders the page with an error.
    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""

    if not username or not password:
        return render_template(
            "login.html",
            username=current_user(),
            error="Please enter username and password."
        )

    pw_hash = USERS.get(username)
    if not pw_hash or not check_password_hash(pw_hash, password):
        return render_template(
            "login.html",
            username=current_user(),
            error="Invalid username or password."
        )

    session["username"] = username
    return redirect(url_for("home"))


@app.get("/logout")
def logout():
    # Logs the user out by removing their username from the session and redirects them home.
    session.pop("username", None)
    return redirect(url_for("home"))


@app.get("/register")
def register():
    # Renders the account registration page with no error message on first load.
    return render_template("register.html", username=current_user(), error=None)


@app.post("/register")
def register_post():
    # Processes submitted registration data, validates it, stores a hashed password, and logs in the new user.
    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""
    confirm = request.form.get("confirm") or ""

    if not username or not password or not confirm:
        return render_template(
            "register.html",
            username=current_user(),
            error="All fields are required."
        )

    if password != confirm:
        return render_template(
            "register.html",
            username=current_user(),
            error="Passwords do not match."
        )

    if username in USERS:
        return render_template(
            "register.html",
            username=current_user(),
            error="Username already exists."
        )

    USERS[username] = generate_password_hash(password)
    session["username"] = username
    return redirect(url_for("home"))


@app.get("/uploads/<path:filename>")
def uploaded_file(filename: str):
    # Serves uploaded map image files from the uploads folder so the browser can display them.
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.get("/api/map")
def api_get_map():
    # Returns the current map metadata as JSON.
    return jsonify(CURRENT_MAP)


@app.post("/api/map/upload")
def api_upload_map():
    # Handles map image uploads, validates and saves the file, updates current map metadata, and clears existing pins.
    global NEXT_PIN_ID

    if "map_file" not in request.files:
        return jsonify({"ok": False, "error": "No file was uploaded."}), 400

    file = request.files["map_file"]

    if not file or not file.filename:
        return jsonify({"ok": False, "error": "No file was selected."}), 400

    if not allowed_image_file(file.filename):
        return jsonify({"ok": False, "error": "Unsupported file type."}), 400

    safe_name = secure_filename(file.filename)
    ext = safe_name.rsplit(".", 1)[1].lower()
    unique_name = f"{uuid4().hex}.{ext}"
    saved_path = UPLOAD_FOLDER / unique_name

    file.save(saved_path)

    try:
        with Image.open(saved_path) as img:
            width, height = img.size
    except Exception:
        saved_path.unlink(missing_ok=True)
        return jsonify({"ok": False, "error": "Could not read image dimensions."}), 400

    CURRENT_MAP["filename"] = unique_name
    CURRENT_MAP["url"] = f"/uploads/{unique_name}"
    CURRENT_MAP["width"] = width
    CURRENT_MAP["height"] = height
    CURRENT_MAP["source"] = "upload"

    PINS.clear()
    NEXT_PIN_ID = 1

    return jsonify({
        "ok": True,
        "message": "Map uploaded successfully. Current pins were cleared.",
        "map": CURRENT_MAP,
        "pins": [],
    })


@app.get("/api/pins")
def api_pins():
    # Returns all current pins as a JSON list.
    return jsonify([pin_to_dict(pin) for pin in PINS])


@app.post("/api/pins")
def api_create_pin():
    # Creates a new pin from browser-sent map coordinates and returns the created pin as JSON.
    global NEXT_PIN_ID

    data = request.get_json(force=True)
    x = float(data["x"])
    y = float(data["y"])

    pin = Pin(
        id=NEXT_PIN_ID,
        x=x,
        y=y,
        name=f"Pin {NEXT_PIN_ID}",
        color="gold",
        description="",
    )

    NEXT_PIN_ID += 1
    PINS.append(pin)

    return jsonify({"ok": True, "pin": pin_to_dict(pin)})


@app.patch("/api/pins/<int:pin_id>")
def api_update_pin(pin_id: int):
    # Updates an existing pin's name, color, description, or coordinates.
    data = request.get_json(force=True)

    for pin in PINS:
        if pin.id == pin_id:
            if "name" in data:
                new_name = (data.get("name") or "").strip()
                if not new_name:
                    return jsonify({"ok": False, "error": "Name cannot be empty"}), 400
                pin.name = new_name

            if "color" in data:
                new_color = (data.get("color") or "").strip()
                if not new_color:
                    return jsonify({"ok": False, "error": "Color cannot be empty"}), 400
                pin.color = new_color

            if "description" in data:
                pin.description = (data.get("description") or "").strip()

            if "x" in data:
                pin.x = float(data["x"])

            if "y" in data:
                pin.y = float(data["y"])

            return jsonify({"ok": True, "pin": pin_to_dict(pin)})

    return jsonify({"ok": False, "error": "Pin not found"}), 404


@app.delete("/api/pins/<int:pin_id>")
def api_delete_pin(pin_id: int):
    # Deletes one pin by ID and reports an error if that pin does not exist.
    global PINS

    original_count = len(PINS)
    PINS = [pin for pin in PINS if pin.id != pin_id]

    if len(PINS) == original_count:
        return jsonify({"ok": False, "error": "Pin not found"}), 404

    return jsonify({"ok": True})


@app.delete("/api/pins")
def api_clear_pins():
    # Deletes all current pins and resets the next pin ID counter.
    global NEXT_PIN_ID

    PINS.clear()
    NEXT_PIN_ID = 1

    return jsonify({"ok": True})


if __name__ == "__main__":
    # Starts the Flask development server when app.py is run directly.
    app.run(host="127.0.0.1", port=5000, debug=True)