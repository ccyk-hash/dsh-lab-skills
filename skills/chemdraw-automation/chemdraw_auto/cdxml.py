"""Minimal, ChemDraw-compatible CDXML document builder.

Coordinates are in points, origin at the page top-left, y grows downward.
Bond length defaults to 14.4 pt (ChemDraw's default 0.508 cm).
"""

from __future__ import annotations

from dataclasses import dataclass
from xml.sax.saxutils import escape
import re

from rdkit import Chem

from .chem import bond_length_stats, molecule_extent

_FORMULA_RE = re.compile(r"([A-Z][a-z]?)(\d+)")

CDXML_HEADER = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<!DOCTYPE CDXML SYSTEM "https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd">\n'
)


@dataclass
class BBox:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


class CDXMLBuilder:
    def __init__(
        self,
        page_width: float = 540,
        page_height: float = 720,
        bond_length: float = 14.4,
        font_id: int = 3,
        font_name: str = "Arial",
        font_size: float = 10,
    ) -> None:
        self.page_width = page_width
        self.page_height = page_height
        self.bond_length = bond_length
        self.font_id = font_id
        self.font_name = font_name
        self.font_size = font_size
        self._last_id = 1
        self._body: list[str] = []

    def _id(self) -> int:
        self._last_id += 1
        return self._last_id

    # ---------------------------------------------------------------- molecules
    def add_molecule(
        self,
        mol: Chem.Mol,
        cx: float,
        cy: float,
        scale: float | None = None,
    ) -> BBox:
        """Place a prepared (2D) molecule centred at (cx, cy). Returns its bbox."""
        conf = mol.GetConformer()
        x0, y0, x1, y1 = molecule_extent(mol)
        if scale is None:
            scale = self.bond_length / bond_length_stats(mol)
        midx = (x0 + x1) / 2
        midy = (y0 + y1) / 2

        def px(x: float) -> float:
            return cx + (x - midx) * scale

        def py(y: float) -> float:
            return cy - (y - midy) * scale

        frag_id = self._id()
        atom_ids: dict[int, int] = {}
        nodes: list[str] = []

        for atom in mol.GetAtoms():
            pos = conf.GetAtomPosition(atom.GetIdx())
            nid = self._id()
            atom_ids[atom.GetIdx()] = nid
            attrs = [f'id="{nid}"', f'p="{px(pos.x):.2f} {py(pos.y):.2f}"', 'color="0"']
            atomic_num = atom.GetAtomicNum()
            if atomic_num != 6:
                attrs.append(f'Element="{atomic_num}"')
            hydrogens = atom.GetTotalNumHs()
            if atomic_num != 6 and hydrogens > 0:
                attrs.append(f'NumHydrogens="{hydrogens}"')
            charge = atom.GetFormalCharge()
            if charge:
                attrs.append(f'Charge="{charge}"')
            isotope = atom.GetIsotope()
            if isotope:
                attrs.append(f'Isotope="{isotope}"')
            if atom.GetNumRadicalElectrons():
                attrs.append('Radical="1"')
            nodes.append("   <n " + " ".join(attrs) + "/>")

        bond_lines: list[str] = []
        for bond in mol.GetBonds():
            bid = self._id()
            attrs = [
                f'id="{bid}"',
                f'B="{atom_ids[bond.GetBeginAtomIdx()]}"',
                f'E="{atom_ids[bond.GetEndAtomIdx()]}"',
                'color="0"',
            ]
            order = bond.GetBondTypeAsDouble()
            if order == 1.5:
                attrs.append('Order="1.5"')
            elif order != 1:
                attrs.append(f'Order="{int(order)}"')
            direction = bond.GetBondDir()
            if direction == Chem.BondDir.BEGINWEDGE:
                attrs.append('Display="WedgeBegin"')
            elif direction == Chem.BondDir.BEGINDASH:
                attrs.append('Display="WedgedHashBegin"')
            bond_lines.append("   <b " + " ".join(attrs) + "/>")

        # y is inverted, so image-space min/max must be recomputed
        ys = [py(conf.GetAtomPosition(i).y) for i in range(mol.GetNumAtoms())]
        xs = [px(conf.GetAtomPosition(i).x) for i in range(mol.GetNumAtoms())]
        bbox = BBox(min(xs), min(ys), max(xs), max(ys))

        block = [f'  <fragment id="{frag_id}">'] + nodes + bond_lines + ["  </fragment>"]
        self._body.extend(block)
        return bbox

    # -------------------------------------------------------------------- text
    def add_text(
        self,
        text: str,
        x: float,
        y: float,
        size: float | None = None,
        justify: str = "Left",
        bold: bool = False,
        chem: bool = True,
    ) -> None:
        tid = self._id()
        size = self.font_size if size is None else size
        base_face = 1 if bold else 0
        runs: list[tuple[str, int]] = []
        if chem:
            pos = 0
            for match in _FORMULA_RE.finditer(text):
                if match.start() > pos:
                    runs.append((text[pos:match.start()], 0))
                runs.append((match.group(1), 0))
                runs.append((match.group(2), 32))
                pos = match.end()
            if pos < len(text):
                runs.append((text[pos:], 0))
        if not runs:
            runs = [(text, 0)]
        spans = []
        for chunk, extra in runs:
            if not chunk:
                continue
            face = base_face | extra
            face_attr = f' face="{face}"' if face else ""
            spans.append(
                f'<s font="{self.font_id}" size="{size:g}" color="0"{face_attr}>'
                f"{escape(chunk)}</s>"
            )
        self._body.append(
            f'  <t id="{tid}" p="{x:.2f} {y:.2f}" Justification="{justify}">'
            + "".join(spans)
            + "</t>"
        )

    def add_plus(self, x: float, y: float, size: float | None = None) -> None:
        self.add_text("+", x, y, size=size or self.font_size + 2, justify="Center")

    # ------------------------------------------------------------------- arrow
    def add_arrow(
        self,
        head_x: float,
        y: float,
        tail_x: float,
        kind: str = "solid",
    ) -> None:
        """Draw a horizontal arrow. BoundingBox's first point is the arrow head."""
        kind_map = {
            "solid": "FullHead",
            "hollow": "Hollow",
            "equilibrium": "Equilibrium",
            "none": "NoHead",
        }
        arrow_type = kind_map.get(kind, "FullHead")
        gid = self._id()
        self._body.append(
            f'  <graphic id="{gid}" GraphicType="Line" color="0" '
            f'BoundingBox="{head_x:.2f} {y:.2f} {tail_x:.2f} {y:.2f}" '
            f'ArrowType="{arrow_type}" LineType="Solid"/>'
        )

    # ------------------------------------------------------------------- page
    def build(self, name: str = "ChemDraw figure") -> str:
        body = "\n".join(self._body)
        return (
            CDXML_HEADER
            + f'<CDXML Name="{escape(name)}" CreationProgram="chemdraw-auto" '
            + f'BoundingBox="0 0 {self.page_width:g} {self.page_height:g}" '
            + f'BondLength="{self.bond_length:g}" LabelFont="{self.font_id}" '
            + f'CaptionFont="{self.font_id}" LabelSize="{self.font_size:g}" '
            + f'CaptionSize="{self.font_size:g}" LineWidth="0.60" BoldWidth="2" '
            + 'HashSpacing="2.50" MarginWidth="1.60" ChainAngle="120" '
            + 'LabelJustification="Auto" CaptionJustification="Left" '
            + 'Justification="Center">\n'
            + f' <fonttable><font id="{self.font_id}" charset="iso-8859-1" '
            + f'name="{escape(self.font_name)}"/></fonttable>\n'
            + " <colortable><color r=\"0\" g=\"0\" b=\"0\"/><color r=\"1\" g=\"1\" b=\"1\"/></colortable>\n"
            + f' <page id="1" BoundingBox="0 0 {self.page_width:g} {self.page_height:g}" '
            + f'Width="{self.page_width:g}" Height="{self.page_height:g}" '
            + 'HeightPages="1" WidthPages="1">\n'
            + body
            + "\n </page>\n</CDXML>\n"
        )
