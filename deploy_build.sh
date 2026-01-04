#!/bin/bash
# Remove source files and build artifacts not needed for production
rm -rf ./util/
rm -rf ./game-logic/src/
rm -rf ./game-logic/target/
rm ./game-logic/.gitignore
rm ./game-logic/Cargo.toml
rm ./game-logic/Cargo.lock
rm .gitignore
rm mise.toml
rm deploy_build.sh
