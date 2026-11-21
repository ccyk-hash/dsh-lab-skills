"""Command line interface for the ChemDraw automation skill."""

from __future__ import annotations

import argparse
import json
import os
import sys

from . import __version__
from .chem import ChemInputError, load_molecule, name_to_smiles
from .com import ChemDrawError, doctor
from . import ops


def _formats(value: str) -> list[str]:
    return [part.strip().lower() for part in value.split(",") if part.strip()]


def _print(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--out", default=os.path.join(os.getcwd(), "chemdraw-out"))
    parser.add_argument("--stem", default="figure")
    parser.add_argument("--formats", default="cdxml,png", type=_formats)
    parser.add_argument("--dpi", default=300, type=int)
    parser.add_argument("--keep-open", action="store_true", help="leave the document open in ChemDraw")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="chemdraw-auto",
        description="Drive a local ChemDraw installation: draw, edit and export editable figures.",
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="check ChemDraw COM, RDKit and export capabilities")

    draw = sub.add_parser("draw", help="draw one molecule")
    group = draw.add_mutually_exclusive_group(required=True)
    group.add_argument("--smiles")
    group.add_argument("--inchi")
    group.add_argument("--name")
    group.add_argument("--mol-file")
    draw.add_argument("--title", default=None)
    _common(draw)

    reaction = sub.add_parser("reaction", help="draw a reaction scheme")
    reaction.add_argument("--reaction", required=True, help="reactants>agents>products (SMILES)")
    reaction.add_argument("--conditions", default=None, help="text above the arrow")
    reaction.add_argument("--yield", dest="yield_text", default=None, help="text below the arrow")
    reaction.add_argument("--title", default=None)
    _common(reaction)

    grid = sub.add_parser("grid", help="draw a grid of molecules from JSON")
    grid.add_argument("--input", required=True, help='JSON file: [{"smiles": "...", "caption": "..."}]')
    grid.add_argument("--columns", default=3, type=int)
    _common(grid)

    edit = sub.add_parser("edit", help="patch an existing CDXML/CDX and export")
    edit.add_argument("--input", required=True)
    edit.add_argument("--patch", required=True, help="JSON file or inline JSON")
    _common(edit)

    inspect = sub.add_parser("inspect", help="summarise a CDXML/CDX document")
    inspect.add_argument("--input", required=True)

    export = sub.add_parser("export", help="export an existing CDXML/CDX")
    export.add_argument("--input", required=True)
    _common(export)

    return parser


def _load_json(value: str):
    if os.path.exists(value):
        with open(value, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return json.loads(value)


def _molecule_smiles(args) -> str:
    if args.smiles:
        return args.smiles
    if args.inchi:
        return args.inchi
    if args.name:
        return name_to_smiles(args.name)
    with open(args.mol_file, "r", encoding="utf-8") as handle:
        return handle.read()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        if args.command == "doctor":
            _print({"ok": True, "doctor": doctor()})
            return 0

        if args.command == "inspect":
            _print({"ok": True, "inspect": ops.inspect_document(args.input)})
            return 0

        if args.command == "draw":
            result = ops.draw_molecule(
                _molecule_smiles(args),
                out_dir=args.out,
                stem=args.stem,
                title=args.title,
                formats=args.formats,
                dpi=args.dpi,
                keep_open=args.keep_open,
            )
        elif args.command == "reaction":
            result = ops.draw_reaction(
                args.reaction,
                out_dir=args.out,
                stem=args.stem,
                conditions=args.conditions,
                yield_text=args.yield_text,
                title=args.title,
                formats=args.formats,
                dpi=args.dpi,
                keep_open=args.keep_open,
            )
        elif args.command == "grid":
            items = _load_json(args.input)
            result = ops.draw_grid(
                items,
                out_dir=args.out,
                stem=args.stem,
                columns=args.columns,
                formats=args.formats,
                dpi=args.dpi,
                keep_open=args.keep_open,
            )
        elif args.command == "edit":
            result = ops.edit_document(
                args.input,
                patch=_load_json(args.patch),
                out_dir=args.out,
                stem=args.stem,
                formats=args.formats,
                dpi=args.dpi,
                keep_open=args.keep_open,
            )
        elif args.command == "export":
            result = ops.render(
                ops.ensure_cdxml(args.input, args.out),
                out_dir=args.out,
                stem=args.stem,
                formats=args.formats,
                dpi=args.dpi,
                keep_open=args.keep_open,
            )
        else:  # pragma: no cover
            raise ValueError(f"unknown command {args.command}")

        _print(result.as_dict())
        return 0 if result.ok else 1

    except (ChemInputError, ChemDrawError, ValueError, OSError) as exc:
        _print({"ok": False, "error": str(exc), "type": type(exc).__name__})
        return 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
