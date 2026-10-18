#!/bin/bash

build_all () {
    # Clear screen
    printf "\033c"

    # Build all variants
    bun build.ts --version $1 --variant full --pretty
    bun build.ts --version $1 --variant full --meta
    # bun build.ts --version $1 --variant lite

    # Wait for key
    read -p ">> Press Enter to build again..."
    build_all $1
}

build_all $1
