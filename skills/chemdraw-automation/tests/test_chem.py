import pytest

from chemdraw_auto.chem import ChemInputError, load_molecule, load_reaction, prepare


def test_smiles_roundtrip():
    mol = prepare(load_molecule("CC(=O)Oc1ccccc1C(=O)O"))
    assert mol.GetNumAtoms() == 13
    assert mol.GetNumConformers() == 1


def test_inchi_input():
    mol = load_molecule("InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3")
    assert mol.GetNumAtoms() == 3


def test_bad_input_raises():
    with pytest.raises(ChemInputError):
        load_molecule("not-a-molecule")


def test_reaction_split():
    rxn = load_reaction("CCO.CC(=O)O>>CC(=O)OCC")
    assert len(rxn.reactants) == 2
    assert len(rxn.products) == 1


def test_reaction_requires_two_sides():
    with pytest.raises(ChemInputError):
        load_reaction("CCO>>")
