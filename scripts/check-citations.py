#!/usr/bin/env python3
"""Check sources and declared paths; report args/globs use cwd, claims use repo root."""

import argparse
import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sources(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "source" and isinstance(child, str):
                yield child
            yield from sources(child)
    elif isinstance(value, list):
        for child in value:
            yield from sources(child)


def path_claims(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in ("paths_verified", "paths_expected_absent", "fabricated_paths") and isinstance(child, list):
                for item in child:
                    file = item.get("path") if isinstance(item, dict) else item
                    exists = not isinstance(item, dict) or item.get("exists") is not False
                    yield key, file, key == "paths_verified" and exists
            yield from path_claims(child)
    elif isinstance(value, list):
        for child in value:
            yield from path_claims(child)


def require_file(path):
    if not path.is_file():
        raise ValueError("file_missing: no regular file")


def read_json(path):
    require_file(path)
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ValueError(f"json_parse_error: {error}") from error


def resolve(value, pointer):
    if pointer == "":
        return
    if not pointer.startswith("/") or re.search(r"~(?![01])", pointer):
        raise ValueError("invalid_pointer: expected / tokens with ~0 or ~1 escapes")
    for raw in pointer[1:].split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(value, dict):
            if token not in value:
                raise ValueError(f"missing_key: {token!r}")
            value = value[token]
        elif isinstance(value, list):
            if (not re.fullmatch(r"0|[1-9][0-9]*", token)
                    or len(token) > len(str(len(value))) or int(token) >= len(value)):
                raise ValueError(f"array_index: {token!r} invalid for length {len(value)}")
            value = value[int(token)]
        else:
            raise ValueError(f"pointer_type: cannot traverse {type(value).__name__}")


def failure(report, file, pointer, error):
    reason = f"file_read_error: {error}" if isinstance(error, OSError) else str(error)
    print(json.dumps({"report": str(report), "file": file, "pointer": pointer, "reason": reason}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+")
    args = parser.parse_args()
    failed = False
    for pattern in args.reports:
        reports = [pattern] if Path(pattern).is_file() else sorted(glob.glob(pattern)) or [pattern]
        for report in reports:
            try:
                data = read_json(Path(report))
            except (ValueError, OSError) as error:
                failure(report, report, None, error)
                failed = True
                continue
            for citation in sources(data):
                file, separator, pointer = citation.partition("#")
                try:
                    path = ROOT / file
                    require_file(path)
                    if separator:
                        resolve(read_json(path), pointer)
                except (ValueError, OSError) as error:
                    failure(report, file, pointer if separator else None, error)
                    failed = True
            for field, file, expected in path_claims(data):
                try:
                    if not isinstance(file, str) or not file:
                        raise ValueError(f"path_claim_invalid: {field} requires a path")
                    if (ROOT / file).exists() != expected:
                        reason = "path_claim_missing" if expected else "path_claim_unexpected"
                        raise ValueError(f"{reason}: {field} requires exists={expected}")
                except (ValueError, OSError) as error:
                    failure(report, file, None, error)
                    failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
