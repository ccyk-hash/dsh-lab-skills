"""Chemistry input parsing and 2D preparation (RDKit -> CDXML coordinates)."""

from __future__ import annotations

from dataclasses import dataclass

from rdkit import Chem
from rdkit.Chem import rdCoordGen, rdDepictor


class ChemInputError(ValueError):
    pass


def load_molecule(text: str) -> Chem.Mol:
    """Parse SMILES / InChI / molfile. Raises ChemInputError with a clear message."""
    text = (text or "").strip()
    if not text:
        raise ChemInputError("empty structure input")

    if text.startswith("InChI="):
        mol = Chem.MolFromInchi(text)
        if mol is not None:
            return mol
        raise ChemInputError("invalid InChI")

    mol = Chem.MolFromSmiles(text)
    if mol is not None:
        return mol

    if "M  END" in text or "\n" in text:
        mol = Chem.MolFromMolBlock(text, sanitize=True, removeHs=True)
        if mol is not None:
            return mol
        mol = Chem.MolFromMolBlock(text, sanitize=False, removeHs=False)
        if mol is not None:
            Chem.SanitizeMol(mol)
            return mol

    raise ChemInputError(f"cannot parse structure: {text[:60]!r}")


def prepare(mol: Chem.Mol, kekulize: bool = True) -> Chem.Mol:
    """Return a 2D-depicted copy with wedge/hash bond directions assigned."""
    work = Chem.Mol(mol)
    if work.GetNumConformers() == 0:
        try:
            rdCoordGen.AddCoords(work)
        except Exception:
            rdDepictor.Compute2DCoords(work)
    if kekulize:
        try:
            Chem.Kekulize(work, clearAromaticFlags=True)
        except Exception:
            pass
    conf = work.GetConformer()
    Chem.WedgeMolBonds(work, conf)
    return work


def bond_length_stats(mol: Chem.Mol) -> float:
    """Median bond length in RDKit coordinate units (used to scale to points)."""
    conf = mol.GetConformer()
    lengths = []
    for bond in mol.GetBonds():
        p1 = conf.GetAtomPosition(bond.GetBeginAtomIdx())
        p2 = conf.GetAtomPosition(bond.GetEndAtomIdx())
        d = ((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2) ** 0.5
        if d > 1e-3:
            lengths.append(d)
    if not lengths:
        return 1.5
    lengths.sort()
    return lengths[len(lengths) // 2]


def molecule_extent(mol: Chem.Mol) -> tuple[float, float, float, float]:
    conf = mol.GetConformer()
    xs = [conf.GetAtomPosition(i).x for i in range(mol.GetNumAtoms())]
    ys = [conf.GetAtomPosition(i).y for i in range(mol.GetNumAtoms())]
    return min(xs), min(ys), max(xs), max(ys)


@dataclass
class ReactionInput:
    reactants: list[Chem.Mol]
    agents: str
    products: list[Chem.Mol]
    raw: str


def name_to_smiles(name: str, timeout: float = 10.0) -> str:
    """Resolve a compound name through PubChem (network required)."""
    import json
    import urllib.parse
    import urllib.request

    quoted = urllib.parse.quote((name or "").strip(), safe="")
    url = (
        "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/"
        f"{quoted}/property/ConnectivitySMILES/JSON"
    )
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = json.load(response)
        return payload["PropertyTable"]["Properties"][0]["ConnectivitySMILES"]
    except Exception as exc:  # noqa: BLE001
        raise ChemInputError(
            f"cannot resolve name {name!r} via PubChem (offline or unknown name); "
            "pass a SMILES string instead"
        ) from exc


def load_reaction(text: str) -> ReactionInput:
    """Parse reaction SMILES: reactants>agents>products (agents optional text)."""
    text = (text or "").strip()
    if not text:
        raise ChemInputError("empty reaction input")
    parts = text.split(">")
    if len(parts) == 2:
        parts = [parts[0], "", parts[1]]
    if len(parts) != 3:
        raise ChemInputError("reaction must use 'reactants>agents>products' syntax")

    def side(chunk: str) -> list[Chem.Mol]:
        chunk = chunk.strip()
        if not chunk:
            return []
        return [load_molecule(part) for part in chunk.split(".") if part.strip()]

    reactants = side(parts[0])
    products = side(parts[2])
    if not reactants or not products:
        raise ChemInputError("reaction needs at least one reactant and one product")
    return ReactionInput(reactants, parts[1].strip(), products, text)
