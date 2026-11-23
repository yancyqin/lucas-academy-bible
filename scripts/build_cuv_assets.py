#!/usr/bin/env python3
"""Compatibility entry point: builds only the CUV assets.

The real builder is scripts/build_bible_assets.py, which handles both local
public-domain editions (WEB and CUV). `--index-only` is passed through.
"""

import sys

from build_bible_assets import main

if __name__ == "__main__":
    main(["--edition", "cuv", *sys.argv[1:]])
