"""
H5API - HDF5 File Browser Backend
=================================
Filesystem-backed Flask microservice that exposes:

  GET /              -> HTML file-browser UI
  GET /api/browse    -> JSON API: list folders and HDF5 files at a prefix
  GET /health        -> Liveness probe
"""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

# Load .env from this directory so startup is independent from current working directory.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

HDF5_EXTENSIONS = (".h5", ".hdf5", ".hdf")
_storage_root = None


def _resolve_storage_root() -> Path:
    explicit_root = os.getenv("STORAGE_ROOT")
    linux_root = os.getenv("STORAGE_PATH_LINUX")
    windows_root = os.getenv("STORAGE_PATH_WINDOWS")

    ordered_candidates = []
    if explicit_root:
        ordered_candidates.append(explicit_root)

    if os.name == "nt":
        ordered_candidates.extend([windows_root, linux_root])
    else:
        ordered_candidates.extend([linux_root, windows_root])

    # Resolve first configured candidate so deployment can move between
    # Windows and Linux without code changes.
    for raw in ordered_candidates:
        value = str(raw or "").strip()
        if value:
            return Path(value).expanduser().resolve(strict=False)

    raise ValueError(
        "Missing storage configuration. Set STORAGE_ROOT or STORAGE_PATH_LINUX/STORAGE_PATH_WINDOWS."
    )


def get_storage_root() -> Path:
    global _storage_root
    if _storage_root is None:
        _storage_root = _resolve_storage_root()
        logger.info("H5API using storage root: %s", _storage_root)
    return _storage_root


def _normalize_prefix(prefix: str) -> str:
    normalized = str(prefix or "").strip().replace("\\", "/").strip("/")
    if not normalized:
        return ""

    parts = [part for part in normalized.split("/") if part and part != "."]
    if any(part == ".." for part in parts):
        raise ValueError("Invalid prefix parameter")
    return "/".join(parts)


def _resolve_prefix_path(prefix: str) -> Path:
    root = get_storage_root()
    normalized_prefix = _normalize_prefix(prefix)
    if not normalized_prefix:
        return root

    target = root.joinpath(*normalized_prefix.split("/")).resolve(strict=False)
    try:
        # Explicitly reject prefix traversal outside configured storage root.
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError("Prefix escapes configured storage root") from exc
    return target


def list_prefix(prefix: str):
    """
    List immediate children at a prefix within configured filesystem storage.
    Only HDF5 file extensions are returned in `files`.
    """
    root = get_storage_root()
    normalized_prefix = _normalize_prefix(prefix)
    target = _resolve_prefix_path(normalized_prefix)

    if not target.exists() or not target.is_dir():
        logger.info("Prefix not found or not a directory: %s", normalized_prefix or "(root)")
        return [], [], normalized_prefix

    folders = []
    files = []

    for entry in sorted(target.iterdir(), key=lambda item: item.name.lower()):
        try:
            relative_key = entry.relative_to(root).as_posix()
        except ValueError:
            continue

        if entry.is_dir():
            folders.append(
                {
                    "key": f"{relative_key.rstrip('/')}/",
                    "name": entry.name,
                    "type": "folder",
                }
            )
            continue

        if not entry.is_file():
            continue

        if not entry.name.lower().endswith(HDF5_EXTENSIONS):
            continue

        stat_result = entry.stat()
        files.append(
            {
                "key": relative_key,
                "name": entry.name,
                "type": "file",
                "size": int(stat_result.st_size),
                "last_modified": datetime.fromtimestamp(
                    stat_result.st_mtime, tz=timezone.utc
                ).isoformat(),
            }
        )

    logger.info(
        "Listed prefix='%s' -> %d folder(s), %d file(s)",
        normalized_prefix or "(root)",
        len(folders),
        len(files),
    )
    return folders, files, normalized_prefix


def make_breadcrumbs(prefix: str) -> list:
    prefix = _normalize_prefix(prefix)
    breadcrumbs = [{"name": "Root", "prefix": ""}]

    if not prefix:
        return breadcrumbs

    running = ""
    for part in prefix.split("/"):
        running = (running + "/" + part).lstrip("/")
        # Breadcrumb prefix values are reusable as `/api/browse?prefix=...`.
        breadcrumbs.append({"name": part, "prefix": running})

    return breadcrumbs


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/browse")
def api_browse():
    prefix = request.args.get("prefix", "")

    try:
        folders, files, normalized_prefix = list_prefix(prefix)
        breadcrumbs = make_breadcrumbs(normalized_prefix)

        return jsonify(
            {
                "success": True,
                "prefix": normalized_prefix,
                "total": len(folders) + len(files),
                "breadcrumbs": breadcrumbs,
                "folders": folders,
                "files": files,
                "storage_root": str(get_storage_root()),
            }
        )
    except Exception as exc:
        logger.exception("Error in /api/browse (prefix='%s')", prefix)
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "H5API"})


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5100))
    debug = os.getenv("DEBUG", "false").lower() == "true"

    try:
        root_log = str(get_storage_root())
    except Exception:
        root_log = "unconfigured"

    logger.info("H5API starting -> http://%s:%d (debug=%s, root=%s)", host, port, debug, root_log)
    app.run(host=host, port=port, debug=debug)
