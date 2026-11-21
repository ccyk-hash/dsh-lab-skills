from lxml import etree
from rdkit import Chem

from chemdraw_auto.cdxml import CDXMLBuilder
from chemdraw_auto.chem import load_molecule, prepare


def _xml(builder):
    return etree.fromstring(builder.build("test").encode("utf-8"))


def test_molecule_nodes_and_bonds():
    mol = prepare(load_molecule("CCO"))
    builder = CDXMLBuilder()
    builder.add_molecule(mol, 270, 320)
    root = _xml(builder)
    atoms = root.findall(".//n")
    bonds = root.findall(".//b")
    assert len(atoms) == 3
    assert len(bonds) == 2
    # carbon atoms omit Element, heteroatoms keep it
    assert atoms[0].get("Element") is None
    assert atoms[-1].get("Element") == "8"
    # explicit black colour is required, otherwise ChemDraw uses palette index 1
    assert all(atom.get("color") == "0" for atom in atoms)
    assert all(bond.get("color") == "0" for bond in bonds)


def test_heteroatom_hydrogens_and_charge():
    mol = prepare(load_molecule("[NH4+]"))
    builder = CDXMLBuilder()
    builder.add_molecule(mol, 200, 200)
    root = _xml(builder)
    atom = root.find(".//n")
    assert atom.get("Element") == "7"
    assert atom.get("NumHydrogens") == "4"
    assert atom.get("Charge") == "1"


def test_subscript_runs_for_formula():
    builder = CDXMLBuilder()
    builder.add_text("H2SO4 (cat.)", 100, 100)
    root = _xml(builder)
    runs = root.findall(".//t/s")
    assert [run.text for run in runs[:5]] == ["H", "2", "S", "O", "4"]
    assert runs[1].get("face") == "32"
    assert runs[4].get("face") == "32"
    assert "".join(run.text for run in runs) == "H2SO4 (cat.)"


def test_arrow_head_is_first_bounding_point():
    builder = CDXMLBuilder()
    builder.add_arrow(300, 320, 250)
    root = _xml(builder)
    graphic = root.find(".//graphic")
    assert graphic.get("BoundingBox").startswith("300.00 320.00 250.00")


def _stereo_displays(smiles):
    mol = prepare(load_molecule(smiles))
    builder = CDXMLBuilder()
    builder.add_molecule(mol, 200, 200)
    root = _xml(builder)
    return [b.get("Display") for b in root.findall(".//b")]


def test_wedge_display_for_stereocenter():
    # CoordGen may legitimately pick a solid wedge or a hashed wedge for the
    # same stereocentre, so accept either -- but a stereo bond must be present
    # and it must be one of the two values ChemDraw actually draws.
    displays = _stereo_displays("N[C@@H](C)C(=O)O")
    stereo = [d for d in displays if d is not None]
    assert stereo, f"expected a stereo bond, got {displays}"
    assert set(stereo) <= {"WedgeBegin", "WedgedHashBegin"}


def test_wedged_hash_mapping():
    # "HashBegin" is accepted by ChemDraw but renders nothing; BEGINDASH must
    # map to "WedgedHashBegin". Force the direction so the test is deterministic.
    mol = prepare(load_molecule("N[C@@H](C)C(=O)O"))
    for bond in mol.GetBonds():
        if bond.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH):
            bond.SetBondDir(Chem.BondDir.BEGINDASH)
    builder = CDXMLBuilder()
    builder.add_molecule(mol, 200, 200)
    root = _xml(builder)
    displays = [b.get("Display") for b in root.findall(".//b")]
    assert "WedgedHashBegin" in displays
    assert "HashBegin" not in displays
