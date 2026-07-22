#!/usr/bin/env bash
# structural-check.sh — Enforce architecture invariants
# Part of the OpenCodeKit harness. Run during /verify and pre-commit.
#
# Returns exit code 0 if all checks pass, 1 if any fail.
# Outputs structured results: PASS or FAIL per check.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ERRORS=0

# --- Helper ---
fail() {
	echo "  FAIL: $1"
	ERRORS=$((ERRORS + 1))
}

pass() {
	echo "  PASS: $1"
}

# --- 1. Plugin isolation: no cross-plugin imports ---
echo "[Check 1/6] Plugin isolation — no cross-plugin imports..."

PLUGIN_DIR="$ROOT/.opencode/plugin"
PLUGINS=()
for f in "$PLUGIN_DIR"/*.ts; do
	name="$(basename "$f" .ts)"
	[ "$name" = "index" ] && continue
	PLUGINS+=("$name")
done

for plugin in "${PLUGINS[@]}"; do
	for other in "${PLUGINS[@]}"; do
		[ "$plugin" = "$other" ] && continue
		if grep -qE "from ['\"](\./)?$other['\"]" "$PLUGIN_DIR/$plugin.ts" 2>/dev/null; then
			fail "$plugin.ts imports from $other.ts — use SDK instead"
		fi
	done
done
pass "No cross-plugin imports detected"

# --- 2. SDK boundary: SDK doesn't import from plugin/ ---
echo "[Check 2/6] SDK boundary — SDK has no plugin dependencies..."

if [ -d "$PLUGIN_DIR/sdk" ]; then
	SDK_FILES=$(find "$PLUGIN_DIR/sdk" -name "*.ts" 2>/dev/null)
	if [ -n "$SDK_FILES" ]; then
		for sdk_file in $SDK_FILES; do
			if grep -qE "from ['\"](\.\./|\.\./\.\./plugin)" "$sdk_file" 2>/dev/null; then
				fail "SDK file $(basename "$sdk_file") imports from plugin/"
			fi
		done
	fi
fi
pass "SDK boundary intact"

# --- 3. File size limits ---
echo "[Check 3/6] File size limits..."

check_size() {
	local path="$1"
	local max="$2"
	local label="$3"
	if [ -f "$path" ]; then
		local lines
		lines=$(wc -l <"$path")
		if [ "$lines" -gt "$max" ]; then
			fail "$label exceeds ${max} lines ($lines)"
		fi
	fi
}

# Plugin files: 300 lines max
for f in "$PLUGIN_DIR"/*.ts; do
	[ ! -f "$f" ] && continue
	name=$(basename "$f")
	[ "$name" = "index.ts" ] && continue
	check_size "$f" 300 "Plugin $name"
done

# SDK files: 150 lines max
while IFS= read -r -d '' f; do
	check_size "$f" 150 "SDK $(basename "$f")"
done < <(find "$PLUGIN_DIR/sdk" -name "*.ts" -type f -print0 2>/dev/null || true)

# Command files: 500 lines max
for f in "$ROOT/.opencode/command"/*.md; do
	[ ! -f "$f" ] && continue
	check_size "$f" 500 "Command $(basename "$f")"
done
pass "All files within size limits"

# --- 4. No TODO/FIXME without owner ---
echo "[Check 4/6] TODO/FIXME hygiene..."

BAD_TODO=$(grep -rn "TODO\|FIXME" "$ROOT/.opencode/plugin/"*.ts 2>/dev/null | grep -v "//.*owner:" || true)
if [ -n "$BAD_TODO" ]; then
	fail "TODOs/FIXMEs without owner in plugin/ (add @owner:name):"
	echo "$BAD_TODO" | head -5
fi
pass "TODO hygiene acceptable"

# --- 5. Consistent naming: kebab-case filenames (basename only) ---
echo "[Check 5/6] Filename convention..."

BAD_NAMES=$(find "$ROOT/.opencode/plugin" "$ROOT/.opencode/tool" -name "*.ts" -o -name "*.sh" 2>/dev/null | grep -v node_modules | while IFS= read -r f; do
	bn=$(basename "$f")
	# Check for uppercase letters in the bare filename
	echo "$bn" | grep -q "[A-Z]" && echo "$f"
done || true)
if [ -n "$BAD_NAMES" ]; then
	fail "Files with uppercase in name (use kebab-case):"
	echo "$BAD_NAMES"
fi
pass "Filename convention OK"

# --- 6. Remediator: if this check fails, instructions are below ---
echo "[Check 6/6] Remediation readiness..."

# Ensure fallow is available
if command -v npx &>/dev/null; then
	if npx fallow --version &>/dev/null; then
		pass "Fallow available for structural analysis"
	else
		echo "  INFO: Fallow not installed — run 'npm install -g fallow' or 'npx fallow'"
	fi
fi

echo ""
echo "---"
if [ "$ERRORS" -eq 0 ]; then
	echo "[OK] All structural checks passed."
	exit 0
else
	echo "[FAIL] $ERRORS structural check(s) failed. Fix issues above."
	echo ""
	echo "Remediation:"
	echo "  - Cross-plugin imports → extract shared types to plugin/sdk/"
	echo "  - File too long → split into smaller modules"
	echo "  - TODOs without owner → add // @owner:name"
	echo "  - Uppercase files → rename to kebab-case"
	exit 1
fi
