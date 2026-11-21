"""COM session around a local ChemDraw installation (Windows only)."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field

import pythoncom
import win32com.client as win32

FORMAT_IDS = {
    "cdxml": 1299735619,   # kCDFormatCDXML
    "cdx": 1397573699,     # kCDFormatCDX
    "png": 1715949136,     # kCDFormatPNG
    "tiff": 1179011412,    # kCDFormatTIFF
    "tif": 1179011412,
    "jpg": 1195724874,     # kCDFormatJPEG
    "jpeg": 1195724874,
    "gif": 1715882311,     # kCDFormatGIF
    "bmp": 542133570,      # kCDFormatBMP
    "emf": 1279675717,     # kCDFormatEnhMetafile
}

RASTER_FORMATS = {"png", "tiff", "tif", "jpg", "jpeg", "gif", "bmp"}
PROGIDS = ("ChemDraw_x64.Application", "ChemDraw.Application")


class ChemDrawError(RuntimeError):
    pass


def _pad_png(path: str, dpi: int, margin_inches: float = 0.12) -> None:
    """ChemDraw crops PNG to ink; add a small white/transparent margin."""
    try:
        from PIL import Image, ImageOps

        pad = max(6, int(round(dpi * margin_inches)))
        with Image.open(path) as image:
            fill = (255, 255, 255, 0) if image.mode in ("RGBA", "LA") else "white"
            padded = ImageOps.expand(image, border=pad, fill=fill)
            padded.save(path)
    except Exception:  # noqa: BLE001
        # padding is cosmetic; never fail an otherwise successful export
        pass


@dataclass
class ChemDrawSession:
    progid: str = ""
    app: object = None
    owned: list[str] = field(default_factory=list)
    _connected: bool = False

    def connect(self) -> "ChemDrawSession":
        if self._connected:
            return self
        last_error = None
        for progid in ([self.progid] if self.progid else list(PROGIDS)):
            try:
                self.app = win32.Dispatch(progid)
                self.progid = progid
                self._connected = True
                return self
            except Exception as exc:  # noqa: BLE001
                last_error = exc
        raise ChemDrawError(
            "cannot connect to ChemDraw via COM; install/launch ChemDraw first "
            f"({last_error})"
        )

    # ------------------------------------------------------------------ basics
    @property
    def version(self) -> str:
        self.connect()
        try:
            return str(self.app.name)
        except Exception:  # noqa: BLE001
            return "unknown"

    @property
    def open_documents(self) -> int:
        self.connect()
        try:
            return int(self.app.Documents.Count)
        except Exception:  # noqa: BLE001
            return -1

    def _retry(self, fn, *args, attempts: int = 3, delay: float = 0.6):
        last = None
        for i in range(attempts):
            try:
                return fn(*args)
            except pythoncom.com_error as exc:  # type: ignore[attr-defined]
                last = exc
                time.sleep(delay * (i + 1))
        raise ChemDrawError(
            "ChemDraw did not respond to automation. A modal dialog or an active "
            f"text edit usually blocks COM; press Esc in ChemDraw and retry. ({last})"
        )

    # --------------------------------------------------------------- documents
    def open(self, path: str, activate: bool = False):
        self.connect()
        path = os.path.abspath(path)
        if not os.path.exists(path):
            raise ChemDrawError(f"file not found: {path}")
        doc = self._retry(self.app.Documents.Open, path)
        if activate:
            try:
                doc.Activate()
            except Exception:  # noqa: BLE001
                pass
        try:
            self.owned.append(str(doc.FullName))
        except Exception:  # noqa: BLE001
            self.owned.append(path)
        return doc

    def save_as(self, doc, path: str, fmt: str, dpi: int | None = None) -> str:
        fmt = fmt.lower().lstrip(".")
        if fmt not in FORMAT_IDS:
            supported = ", ".join(sorted(FORMAT_IDS))
            raise ChemDrawError(f"unsupported export format '{fmt}' ({supported})")
        path = os.path.abspath(path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if fmt in RASTER_FORMATS:
            self._retry(doc.SaveAs, path, FORMAT_IDS[fmt], int(dpi or 300))
        else:
            self._retry(doc.SaveAs, path, FORMAT_IDS[fmt])
        if not os.path.exists(path):
            raise ChemDrawError(f"ChemDraw reported success but no file was written: {path}")
        if fmt == "png":
            _pad_png(path, int(dpi or 300))
        return path

    def close(self, doc, save: bool = False) -> None:
        try:
            self._retry(doc.Close, 1 if save else 0)
        except Exception as exc:  # noqa: BLE001
            raise ChemDrawError(f"failed to close document: {exc}") from exc

    def close_all_owned(self) -> None:
        """Best-effort close of documents this session opened (never user documents)."""
        if not self._connected:
            return
        try:
            docs = self.app.Documents
            for i in range(int(docs.Count), 0, -1):
                try:
                    doc = docs(i)
                    if str(doc.FullName) in self.owned:
                        doc.Close(0)
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            pass

    # ------------------------------------------------------------------ export
    def export_document(
        self,
        cdxml_path: str,
        out_dir: str,
        stem: str,
        formats: list[str],
        dpi: int = 300,
        keep_open: bool = False,
    ) -> list[str]:
        doc = self.open(cdxml_path)
        written: list[str] = []
        try:
            for fmt in formats:
                fmt = fmt.lower().lstrip(".")
                target = os.path.join(out_dir, f"{stem}.{fmt}")
                written.append(self.save_as(doc, target, fmt, dpi))
        finally:
            if not keep_open:
                self.close(doc)
        return written


def doctor() -> dict:
    import platform
    import sys

    info: dict = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "chemdraw": None,
        "progid": None,
        "documents": None,
        "formats": sorted(FORMAT_IDS),
        "rdkit": None,
        "error": None,
    }
    try:
        from rdkit import rdBase

        info["rdkit"] = rdBase.rdkitVersion
    except Exception:  # noqa: BLE001
        info["rdkit"] = "missing"

    session = ChemDrawSession()
    try:
        session.connect()
        info["chemdraw"] = session.version
        info["progid"] = session.progid
        info["documents"] = session.open_documents
    except Exception as exc:  # noqa: BLE001
        info["error"] = str(exc)
    return info
