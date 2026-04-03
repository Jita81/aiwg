#!/usr/bin/env bash
# templates/configure.sh — Configure installed software
# Platform: linux, macos, wsl2
# Params: INSTALL_DIR (required), CONFIG_DIR (default: ~/.config/<project>)
set -euo pipefail
source "$(dirname "$0")/../lib/detect.sh"
source "$(dirname "$0")/../lib/params.sh"
source "$(dirname "$0")/../lib/verify.sh"

# --- param validation ---
aiwg_require_param INSTALL_DIR
aiwg_expand_path INSTALL_DIR
CONFIG_DIR="${CONFIG_DIR:-${HOME}/.config/$(basename "${INSTALL_DIR}")}"
aiwg_expand_path CONFIG_DIR

# --- main ---
echo "Configuring in ${CONFIG_DIR}..."
mkdir -p "${CONFIG_DIR}"

# Copy default config if not already present
if [[ -f "${INSTALL_DIR}/config/defaults.conf" && ! -f "${CONFIG_DIR}/config.conf" ]]; then
  cp "${INSTALL_DIR}/config/defaults.conf" "${CONFIG_DIR}/config.conf"
  echo "  Wrote default config to ${CONFIG_DIR}/config.conf"
fi

# --- verify ---
aiwg_verify_path "${CONFIG_DIR}" dir
