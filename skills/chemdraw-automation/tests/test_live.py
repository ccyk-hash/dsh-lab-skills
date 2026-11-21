import os

import pytest

LIVE = os.environ.get("CHEMDRAW_LIVE_TEST") == "1"

pytestmark = pytest.mark.skipif(
    not LIVE, reason="set CHEMDRAW_LIVE_TEST=1 to drive the installed ChemDraw"
)


def test_draw_molecule_end_to_end(tmp_path):
    from chemdraw_auto import ops

    result = ops.draw_molecule(
        "CC(=O)Oc1ccccc1C(=O)O",
        out_dir=str(tmp_path),
        stem="aspirin",
        title="Aspirin",
        formats=["cdxml", "cdx", "png"],
        dpi=300,
    )
    assert result.ok
    names = {os.path.splitext(p)[1] for p in result.files}
    assert {".cdxml", ".cdx", ".png"} <= names
    png = [p for p in result.files if p.endswith(".png")][0]
    assert os.path.getsize(png) > 5000
    info = ops.inspect_document(result.cdxml)
    assert info["atoms"] == 13
    assert info["bonds"] == 13


def test_reaction_step_is_semantic(tmp_path):
    from lxml import etree

    from chemdraw_auto import ops

    result = ops.draw_reaction(
        "CCO.CC(=O)O>>CC(=O)OCC",
        out_dir=str(tmp_path),
        stem="ester",
        conditions="H2SO4 (cat.)",
        yield_text="88%",
        formats=["cdxml", "png"],
    )
    assert result.ok
    root = etree.parse(result.cdxml).getroot()
    step = root.find(".//step")
    assert step is not None
    assert step.get("ReactionStepReactants")
    assert step.get("ReactionStepProducts")
    assert step.get("ReactionStepObjectsAboveArrow")
