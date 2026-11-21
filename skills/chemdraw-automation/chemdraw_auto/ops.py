"""High-level operations: draw molecules / reactions / grids, edit, inspect, export."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from math import ceil

from lxml import etree
from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

from .cdxml import CDXMLBuilder
from .chem import bond_length_stats, load_molecule, load_reaction, molecule_extent, prepare
from .com import ChemDrawSession

DEFAULT_BOND_LENGTH = 14.4


@dataclass
class Result:
    ok: bool
    files: list[str] = field(default_factory=list)
    cdxml: str | None = None
    meta: dict = field(default_factory=dict)
    error: str | None = None

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "files": self.files,
            "cdxml": self.cdxml,
            "meta": self.meta,
            "error": self.error,
        }


def _write(path: str, text: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return path


def _size(mol: Chem.Mol, bond_length: float) -> tuple[float, float, float]:
    x0, y0, x1, y1 = molecule_extent(mol)
    scale = bond_length / bond_length_stats(mol)
    return (x1 - x0) * scale, (y1 - y0) * scale, scale


def _text_width(text: str | None, size: float = 10.0) -> float:
    """Rough single-line width of Arial text, in points (0.56 em per glyph)."""
    if not text:
        return 0.0
    return len(text) * size * 0.56


# --------------------------------------------------------------------- drawing
def build_molecule_doc(
    smiles: str,
    title: str | None = None,
    bond_length: float = DEFAULT_BOND_LENGTH,
) -> tuple[str, dict]:
    mol = prepare(load_molecule(smiles))
    width, height, _ = _size(mol, bond_length)
    page_width = max(540.0, width + 160.0)
    center_y = 320.0
    builder = CDXMLBuilder(page_width=page_width, bond_length=bond_length)
    bbox = builder.add_molecule(mol, page_width / 2, center_y)
    if title:
        builder.add_text(title, bbox.cx, bbox.y0 - 20, size=10, justify="Center")
    meta = {
        "kind": "molecule",
        "smiles": Chem.MolToSmiles(mol),
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "atoms": mol.GetNumAtoms(),
        "bonds": mol.GetNumBonds(),
        "width_pt": round(width, 1),
        "height_pt": round(height, 1),
    }
    return builder.build(title or "molecule"), meta


def build_reaction_doc(
    reaction: str,
    conditions: str | None = None,
    yield_text: str | None = None,
    title: str | None = None,
    bond_length: float = DEFAULT_BOND_LENGTH,
) -> tuple[str, dict]:
    rxn = load_reaction(reaction)
    reactants = [prepare(m) for m in rxn.reactants]
    products = [prepare(m) for m in rxn.products]
    conditions = conditions or rxn.agents

    def measure(mols):
        return [_size(m, bond_length)[0] for m in mols]

    rw = measure(reactants)
    pw = measure(products)
    plus_w = 22.0
    gap = 14.0
    # Conditions/yield text sits centred above/below the arrow, so the arrow
    # must be at least as wide as that text -- otherwise the caption runs into
    # the reactant structure on the left.
    arrow_w = max(
        52.0,
        _text_width(conditions) + 26.0,
        _text_width(yield_text) + 26.0,
    )
    total = (
        sum(rw)
        + plus_w * max(0, len(reactants) - 1)
        + gap * 2
        + arrow_w
        + gap * 2
        + sum(pw)
        + plus_w * max(0, len(products) - 1)
    )
    page_width = max(540.0, total + 100.0)
    y = 320.0
    x = (page_width - total) / 2

    builder = CDXMLBuilder(page_width=page_width, bond_length=bond_length)
    for index, mol in enumerate(reactants):
        builder.add_molecule(mol, x + rw[index] / 2, y)
        x += rw[index]
        if index < len(reactants) - 1:
            builder.add_plus(x + plus_w / 2, y + 3)
            x += plus_w

    x += gap
    head_x = x + arrow_w
    builder.add_arrow(head_x, y, x, "solid")
    arrow_center = x + arrow_w / 2
    if conditions:
        builder.add_text(conditions, arrow_center, y - 26, size=10, justify="Center")
    if yield_text:
        builder.add_text(yield_text, arrow_center, y + 30, size=10, justify="Center")
    x = head_x + gap

    for index, mol in enumerate(products):
        builder.add_molecule(mol, x + pw[index] / 2, y)
        x += pw[index]
        if index < len(products) - 1:
            builder.add_plus(x + plus_w / 2, y + 3)
            x += plus_w

    if title:
        builder.add_text(title, page_width / 2, y - 90, size=11, justify="Center", bold=True)

    meta = {
        "kind": "reaction",
        "reactants": [Chem.MolToSmiles(m) for m in reactants],
        "products": [Chem.MolToSmiles(m) for m in products],
        "conditions": conditions,
        "yield": yield_text,
        "width_pt": round(total, 1),
    }
    return builder.build(title or "reaction"), meta


def build_grid_doc(
    items: list[dict],
    columns: int = 3,
    bond_length: float = DEFAULT_BOND_LENGTH,
) -> tuple[str, dict]:
    if not items:
        raise ValueError("grid needs at least one item")
    prepared = []
    for item in items:
        mol = prepare(load_molecule(item["smiles"]))
        prepared.append((mol, item.get("caption", "")))

    sizes = [_size(mol, bond_length) for mol, _ in prepared]
    caption_w = max([len(caption) * 5.6 + 12 for _, caption in prepared] + [0])
    cell_w = max(max(w for w, _, _ in sizes) + 34, caption_w, 140.0)
    cell_h = max(max(h for _, h, _ in sizes) + 46, 110.0)
    columns = max(1, min(columns, len(prepared)))
    rows = ceil(len(prepared) / columns)
    page_width = max(540.0, columns * cell_w + 80.0)

    builder = CDXMLBuilder(page_width=page_width, bond_length=bond_length)
    for index, (mol, caption) in enumerate(prepared):
        row, col = divmod(index, columns)
        cx = 40 + col * cell_w + cell_w / 2
        cy = 70 + row * cell_h + cell_h / 2
        bbox = builder.add_molecule(mol, cx, cy)
        if caption:
            builder.add_text(caption, bbox.cx, bbox.y1 + 18, size=9.5, justify="Center")

    meta = {"kind": "grid", "count": len(prepared), "columns": columns, "rows": rows}
    return builder.build("grid"), meta


# --------------------------------------------------------------------- export
def render(
    cdxml_path: str,
    out_dir: str,
    stem: str,
    formats: list[str],
    dpi: int = 300,
    keep_open: bool = False,
) -> Result:
    formats = [f.lower().lstrip(".") for f in formats]
    if keep_open and "cdxml" not in formats:
        formats.append("cdxml")
    ordered = [f for f in ("cdxml", "cdx") if f in formats] + [
        f for f in formats if f not in ("cdxml", "cdx")
    ]
    session = ChemDrawSession()
    session.connect()
    files = session.export_document(
        cdxml_path, out_dir, stem, ordered, dpi=dpi, keep_open=False
    )
    canonical = os.path.join(out_dir, f"{stem}.cdxml")
    if keep_open:
        session.open(canonical if os.path.exists(canonical) else cdxml_path, activate=True)
    return Result(
        ok=True,
        files=files,
        cdxml=canonical if os.path.exists(canonical) else cdxml_path,
        meta={"formats": ordered, "dpi": dpi},
    )


def _cleanup_source(source: str, result: Result) -> None:
    if os.path.abspath(source) != os.path.abspath(result.cdxml or ""):
        try:
            os.remove(source)
        except OSError:
            pass


def draw_molecule(
    smiles: str,
    out_dir: str,
    stem: str = "molecule",
    title: str | None = None,
    formats: list[str] | None = None,
    dpi: int = 300,
    keep_open: bool = False,
) -> Result:
    xml, meta = build_molecule_doc(smiles, title=title)
    source = _write(os.path.join(out_dir, f".{stem}.src.cdxml"), xml)
    result = render(source, out_dir, stem, formats or ["cdxml", "png"], dpi, keep_open)
    result.meta.update(meta)
    _cleanup_source(source, result)
    return result


def draw_reaction(
    reaction: str,
    out_dir: str,
    stem: str = "reaction",
    conditions: str | None = None,
    yield_text: str | None = None,
    title: str | None = None,
    formats: list[str] | None = None,
    dpi: int = 300,
    keep_open: bool = False,
) -> Result:
    xml, meta = build_reaction_doc(reaction, conditions, yield_text, title)
    source = _write(os.path.join(out_dir, f".{stem}.src.cdxml"), xml)
    result = render(source, out_dir, stem, formats or ["cdxml", "png"], dpi, keep_open)
    result.meta.update(meta)
    _cleanup_source(source, result)
    return result


def draw_grid(
    items: list[dict],
    out_dir: str,
    stem: str = "grid",
    columns: int = 3,
    formats: list[str] | None = None,
    dpi: int = 300,
    keep_open: bool = False,
) -> Result:
    xml, meta = build_grid_doc(items, columns)
    source = _write(os.path.join(out_dir, f".{stem}.src.cdxml"), xml)
    result = render(source, out_dir, stem, formats or ["cdxml", "png"], dpi, keep_open)
    result.meta.update(meta)
    _cleanup_source(source, result)
    return result


# ----------------------------------------------------------------------- edit
def ensure_cdxml(path: str, work_dir: str) -> str:
    """Return a CDXML path; binary .cdx files are converted through ChemDraw."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".cdxml":
        return path
    if ext in (".cdx", ".cd", ""):
        os.makedirs(work_dir, exist_ok=True)
        target = os.path.join(work_dir, ".converted.cdxml")
        session = ChemDrawSession()
        session.connect()
        doc = session.open(path)
        try:
            session.save_as(doc, target, "cdxml")
        finally:
            session.close(doc)
        return target
    raise ValueError(f"unsupported input format: {ext or path}")


def _parse(path: str) -> etree._ElementTree:
    parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False)
    return etree.parse(path, parser)


def _as_int(value, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"patch field '{field}' must be an integer") from exc


def apply_patch(tree: etree._ElementTree, patch: dict) -> dict:
    root = tree.getroot()
    changed = {"atoms": 0, "bonds": 0, "texts": 0}

    for item in patch.get("atoms", []):
        node = root.xpath(f'.//n[@id="{_as_int(item.get("id"), "id")}"]')
        if not node:
            raise ValueError(f'atom id {item.get("id")} not found')
        node = node[0]
        if "element" in item:
            node.set("Element", str(_as_int(item["element"], "element")))
        if "label" in item:
            node.set("Label", str(item["label"]))
            node.set("NodeType", "Nickname")
        if "charge" in item:
            node.set("Charge", str(_as_int(item["charge"], "charge")))
        if "isotope" in item:
            node.set("Isotope", str(_as_int(item["isotope"], "isotope")))
        if "num_hydrogens" in item:
            node.set("NumHydrogens", str(_as_int(item["num_hydrogens"], "num_hydrogens")))
        changed["atoms"] += 1

    for item in patch.get("bonds", []):
        node = root.xpath(f'.//b[@id="{_as_int(item.get("id"), "id")}"]')
        if not node:
            raise ValueError(f'bond id {item.get("id")} not found')
        node = node[0]
        if "order" in item:
            node.set("Order", str(item["order"]))
        if "display" in item:
            node.set("Display", str(item["display"]))
        changed["bonds"] += 1

    for item in patch.get("texts", []):
        node = root.xpath(f'.//t[@id="{_as_int(item.get("id"), "id")}"]')
        if not node:
            raise ValueError(f'text id {item.get("id")} not found')
        node = node[0]
        runs = node.findall(".//s")
        if runs:
            runs[0].text = str(item["text"])
            for extra in runs[1:]:
                extra.getparent().remove(extra)
        else:
            etree.SubElement(node, "s").text = str(item["text"])
        changed["texts"] += 1

    return changed


def edit_document(
    input_path: str,
    patch: dict,
    out_dir: str,
    stem: str = "edited",
    formats: list[str] | None = None,
    dpi: int = 300,
    keep_open: bool = False,
) -> Result:
    input_path = ensure_cdxml(input_path, out_dir)
    tree = _parse(input_path)
    changed = apply_patch(tree, patch)
    os.makedirs(out_dir, exist_ok=True)
    source = os.path.join(out_dir, f".{stem}.src.cdxml")
    tree.write(source, encoding="UTF-8", xml_declaration=True)
    result = render(source, out_dir, stem, formats or ["cdxml", "png"], dpi, keep_open)
    result.meta["changed"] = changed
    result.meta["input"] = os.path.abspath(input_path)
    _cleanup_source(source, result)
    return result


# -------------------------------------------------------------------- inspect
def inspect_document(path: str) -> dict:
    import tempfile

    path = ensure_cdxml(path, tempfile.mkdtemp(prefix="chemdraw_auto_"))
    tree = _parse(path)
    root = tree.getroot()
    atoms = root.findall(".//n")
    bonds = root.findall(".//b")
    fragments = root.findall(".//fragment")
    texts = root.findall(".//t")
    arrow_elements = root.findall(".//arrow")
    if arrow_elements:
        arrows = arrow_elements
    else:
        arrows = [
            g
            for g in root.findall(".//graphic")
            if g.get("ArrowType") and not g.get("SupersededBy")
        ]
    elements: dict[str, int] = {}
    for atom in atoms:
        number = int(atom.get("Element", "6"))
        symbol = Chem.GetPeriodicTable().GetElementSymbol(number)
        elements[symbol] = elements.get(symbol, 0) + 1
    captions = [
        "".join(t.itertext()).strip() for t in texts if t.getparent().tag != "n"
    ]
    captions = [c for c in captions if c]
    return {
        "path": os.path.abspath(path),
        "fragments": len(fragments),
        "atoms": len(atoms),
        "bonds": len(bonds),
        "arrows": len(arrows),
        "texts": len(captions),
        "elements": elements,
        "captions": captions[:20],
        "root_bbox": root.get("BoundingBox"),
    }
