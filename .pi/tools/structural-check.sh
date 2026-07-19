#!/usr/bin/env bash
# structural-check.sh — Enforce architecture invariants
# Part of the Pi semantic port harness. Run during /verify and pre-commit.
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

PLUGIN_DIR="$ROOT/.pi/extensions"

# A "plugin" is either a top-level .ts file (minus the index.ts barrel) or
# a subdirectory of extensions/.
# Files within the same plugin (e.g. extensions/skill-mcp/*) may import each
# other; importing another plugin is a violation. Discovery is recursive so
# files nested under a subdirectory plugin are grouped with that plugin.
declare -a PLUGIN_NAMES=()
declare -A PLUGIN_FILE_LIST=()
declare -A PLUGIN_DIR_LIST=()

shopt -s nullglob
for f in "$PLUGIN_DIR"/*.ts; do
	name="$(basename "$f" .ts)"
	[ "$name" = "index" ] && continue
	PLUGIN_NAMES+=("$name")
	PLUGIN_FILE_LIST["$name"]="$f"
done
for d in "$PLUGIN_DIR"/*/; do
	name="$(basename "$d")"
	PLUGIN_NAMES+=("$name")
	PLUGIN_DIR_LIST["$name"]="$d"
done
shopt -u nullglob

cross_violation=0
check_file_imports() {
	local plugin="$1" file="$2"
	for other in "${PLUGIN_NAMES[@]}"; do
		[ "$other" = "$plugin" ] && continue
		# Relative import whose first real path segment is another plugin.
		# Matches ./other, ./other.js, ./other/sub, ../other, ../other/sub, …
		if grep -qE "from ['\"]((\.\./)+(\./)?|\./)$other((/[^'\"]*)|\.js)?['\"]" "$file" 2>/dev/null; then
			fail "$(basename "$file") (plugin $plugin) imports from plugin $other — use SDK instead"
			cross_violation=1
		fi
	done
}
for plugin in "${PLUGIN_NAMES[@]}"; do
	if [ -n "${PLUGIN_DIR_LIST[$plugin]:-}" ]; then
		while IFS= read -r -d '' file; do
			check_file_imports "$plugin" "$file"
		done < <(find "${PLUGIN_DIR_LIST[$plugin]}" -name "*.ts" -type f -print0 2>/dev/null)
	else
		check_file_imports "$plugin" "${PLUGIN_FILE_LIST[$plugin]}"
	fi
done
[ "$cross_violation" -eq 0 ] && pass "No cross-plugin imports detected"

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

# Active extensions (recursive): 300 lines max.
# Only the top-level index.ts barrel is skipped; files inside subdirectory
# plugins (e.g. skill-mcp/) are checked.
while IFS= read -r -d '' f; do
	case "$f" in
		"$PLUGIN_DIR/index.ts") continue ;;
	esac
	check_size "$f" 300 "Extension $(basename "$f")"
done < <(find "$PLUGIN_DIR" -name "*.ts" -type f -print0 2>/dev/null)

# SDK files: 150 lines max
while IFS= read -r -d '' f; do
	check_size "$f" 150 "SDK $(basename "$f")"
done < <(find "$PLUGIN_DIR/sdk" -name "*.ts" -type f -print0 2>/dev/null || true)

# Lifecycle command prompts. ship.md is ~500 lines by design, so the limit
# is 550 to avoid rewriting its operator contract for size alone.
for name in audit create fix gc init plan research ship verify; do
	f="$ROOT/.pi/prompts/$name.md"
	[ ! -f "$f" ] && continue
	check_size "$f" 550 "Prompt $name.md"
done
pass "All files within size limits"

# --- 4. No TODO/FIXME without owner ---
echo "[Check 4/6] TODO/FIXME hygiene..."

BAD_TODO=$(grep -rn "TODO\|FIXME" "$ROOT/.pi/extensions/"*.ts 2>/dev/null | grep -v "//.*owner:" || true)
if [ -n "$BAD_TODO" ]; then
	fail "TODOs/FIXMEs without owner in plugin/ (add @owner:name):"
	echo "$BAD_TODO" | head -5
fi
pass "TODO hygiene acceptable"

# --- 5. Consistent naming: kebab-case filenames (basename only) ---
echo "[Check 5/6] Filename convention..."

BAD_NAMES=$(find "$ROOT/.pi/extensions" "$ROOT/.pi/tools" \( -name "*.ts" -o -name "*.sh" \) 2>/dev/null | grep -v node_modules | while IFS= read -r f; do
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
