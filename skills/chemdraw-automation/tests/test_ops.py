import json
import os

from chemdraw_auto import ops


def test_build_reaction_has_arrow_and_texts(tmp_path):
    xml, meta = ops.build_reaction_doc(
        "CCO.CC(=O)O>>CC(=O)OCC",
        conditions="H2SO4 (cat.)",
        yield_text="88%",
        title="Esterification",
    )
    assert meta["kind"] == "reaction"
    assert meta["reactants"] and meta["products"]
    assert "ArrowType=\"FullHead\"" in xml
    assert "H2SO4" in "".join(etree_fromstring(xml).itertext())
    assert "88%" in xml


def etree_fromstring(xml):
    from lxml import etree

    return etree.fromstring(xml.encode("utf-8"))


def test_long_conditions_widen_arrow_instead_of_overlapping():
    conditions = "H2SO4 (cat.), H2O, reflux"
    xml, _ = ops.build_reaction_doc(
        "CC(=O)OC1=CC=CC=C1C(=O)O>O>C1=CC=C(C=C1)OC(=O)C.CC(=O)O",
        conditions=conditions,
        yield_text="85%",
    )
    root = etree_fromstring(xml)
    graphic = root.find(".//graphic")
    bx0, _, bx1, _ = (float(v) for v in graphic.get("BoundingBox").split())
    tail, head = min(bx0, bx1), max(bx0, bx1)

    # the arrow must be wide enough to host the caption centred above it
    assert head - tail >= ops._text_width(conditions)

    # ...and no atom may sit inside the arrow's horizontal band
    xs = [float(n.get("p").split()[0]) for n in root.findall(".//n")]
    assert not [x for x in xs if tail - 6 < x < head + 6]

    # the caption is centred over the arrow
    caption = [t for t in root.findall(".//t") if "H2SO4" in "".join(t.itertext())][0]
    assert abs(float(caption.get("p").split()[0]) - (tail + head) / 2) < 1.0


def test_apply_patch_updates_atom_bond_text(tmp_path):
    xml, _ = ops.build_molecule_doc("CCO", title="Ethanol")
    path = tmp_path / "in.cdxml"
    path.write_text(xml, encoding="utf-8")

    tree = ops._parse(str(path))
    root = tree.getroot()
    atom_id = root.find(".//n").get("id")
    bond_id = root.find(".//b").get("id")
    text_id = [t.get("id") for t in root.findall(".//t") if t.getparent().tag != "n"][0]

    changed = ops.apply_patch(
        tree,
        {
            "atoms": [{"id": atom_id, "element": 7, "charge": 1, "num_hydrogens": 3}],
            "bonds": [{"id": bond_id, "order": 2}],
            "texts": [{"id": text_id, "text": "Ethylamine"}],
        },
    )
    assert changed == {"atoms": 1, "bonds": 1, "texts": 1}

    out = etree_tostring(tree)
    assert 'Element="7"' in out
    assert 'Charge="1"' in out
    assert 'Order="2"' in out
    assert "Ethylamine" in out


def etree_tostring(tree):
    from lxml import etree

    return etree.tostring(tree, encoding="unicode")


def test_inspect_counts(tmp_path):
    xml, _ = ops.build_molecule_doc("c1ccccc1O", title="Phenol")
    path = tmp_path / "phenol.cdxml"
    path.write_text(xml, encoding="utf-8")
    info = ops.inspect_document(str(path))
    assert info["atoms"] == 7
    assert info["elements"]["O"] == 1
    assert info["captions"] == ["Phenol"]
