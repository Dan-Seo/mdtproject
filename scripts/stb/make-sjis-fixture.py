"""Make a reproducible Shift_JIS ST-Bridge fixture from a UTF-8 XML file."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


XML_ENCODING = re.compile(
    r'(<\?xml\b[^?]*?\bencoding\s*=\s*["\'])UTF-8(["\'])',
    re.IGNORECASE,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    text = args.source.read_text(encoding="utf-8")
    text, replacements = XML_ENCODING.subn(r"\1Shift_JIS\2", text, count=1)
    if replacements != 1:
        raise SystemExit("UTF-8 XML encoding declaration not found")

    args.destination.write_bytes(text.encode("cp932"))


if __name__ == "__main__":
    main()
