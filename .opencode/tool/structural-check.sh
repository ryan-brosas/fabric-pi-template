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

# Fail-closed negative-match helper. A "negative check" asserts that a pattern
# is ABSENT. rg exit 1 = pattern absent = clean (pass); exit 0 = pattern present
# = forbidden (fail); exit >=2 = tool error (fail). Never use `! rg` or
# `rg ... || [ $? -eq 1 ]` (both wrongly pass on the forbidden exit-0 case).
rg_neg() {
	local pattern="$1"
	local path="$2"
	local label="${3:-negative check}"
	local rc=0
	rg -n -e "$pattern" "$path" >/dev/null 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "$label: forbidden match found"
	elif [ "$rc" -eq 1 ]; then
		pass "$label: clean"
	else
		fail "$label: rg error (exit $rc)"
	fi
}

# --- 1. Plugin isolation: no cross-plugin imports ---
echo "[Check 1/8] Plugin isolation — no cross-plugin imports..."

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
echo "[Check 2/8] SDK boundary — SDK has no plugin dependencies..."

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
echo "[Check 3/8] File size limits..."

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
echo "[Check 4/8] TODO/FIXME hygiene..."

BAD_TODO=$(grep -rn "TODO\|FIXME" "$ROOT/.opencode/plugin/"*.ts 2>/dev/null | grep -v "//.*owner:" || true)
if [ -n "$BAD_TODO" ]; then
	fail "TODOs/FIXMEs without owner in plugin/ (add @owner:name):"
	echo "$BAD_TODO" | head -5
fi
pass "TODO hygiene acceptable"

# --- 5. Consistent naming: kebab-case filenames (basename only) ---
echo "[Check 5/8] Filename convention..."

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
echo "[Check 6/8] Remediation readiness..."

# Ensure fallow is available (offline: probe an installed binary only; never
# install, cache, or contact a registry from this checker).
if command -v fallow &>/dev/null; then
	pass "Fallow available for structural analysis"
else
	echo "  INFO: Fallow not installed — install it offline (e.g. 'npm install -g fallow') to enable structural analysis; this check is skipped, not failed"
fi

# --- 7. /create contract (Pi-native init: both modes + packet gate) ---
echo "[Check 7/8] /create contract — both modes, packet gate, source bounds, provenance..."

CREATE="$ROOT/.pi/prompts/create.md"

if [ ! -f "$CREATE" ]; then
	fail "create.md missing"
else
	# Argument grammar: raw description AND --from source mode (RED until P3.2)
	if rg -q -- '--from' "$CREATE"; then
		pass "create.md: --from source mode grammar present"
	else
		fail "create.md: missing --from source mode grammar"
	fi

	# Ready-packet gate: schema v1, ready, reload flag, matching AGENTS hash (RED until P3.2)
	if rg -q 'agents_boilerplate_sha256' "$CREATE" && rg -q 'context_reload_required' "$CREATE" && rg -q 'initialization_status: ready' "$CREATE"; then
		pass "create.md: complete ready-packet gate present"
	else
		fail "create.md: missing complete ready-packet gate (schema/hash/reload)"
	fi

	# Memory access uses .pi/memory.md (RED until P3.2)
	if rg -q '\.pi/memory\.md' "$CREATE"; then
		pass "create.md: uses .pi/memory.md"
	else
		fail "create.md: missing .pi/memory.md reference"
	fi
	rg_neg '\.opencode/artifacts/MEMORY\.md' "$CREATE" "create.md: old .opencode memory path absent"

	# Source bounds: file/section size limits (RED until P3.2)
	if rg -q '1,048,576' "$CREATE" && rg -q '65,536' "$CREATE"; then
		pass "create.md: source size bounds present"
	else
		fail "create.md: missing source size bounds (1,048,576 / 65,536)"
	fi

	# Stable provenance: path/anchor/whole-file hash/RM ID (RED until P3.2)
	if rg -q -i 'provenance' "$CREATE" && rg -q -i 'sha256' "$CREATE"; then
		pass "create.md: provenance fields present"
	else
		fail "create.md: missing provenance (path/anchor/hash/RM ID)"
	fi

	# No roadmap mutation: /create must declare it never mutates .pi/ROADMAP.md (RED until P3.2)
	if rg -qi 'never.*mutate.*ROADMAP|never.*write.*ROADMAP|read.only.*ROADMAP' "$CREATE"; then
		pass "create.md: no-roadmap-mutation declared"
	else
		fail "create.md: missing no-roadmap-mutation declaration"
	fi

	# Preserved safeguards (GREEN — existing behavior that P3.2 must not regress)
	if rg -q 'mkdir -p.*\.pi/artifacts' "$CREATE"; then
		pass "create.md: sole namespace ownership (mkdir -p) preserved"
	else
		fail "create.md: namespace mkdir ownership lost"
	fi

	if rg -q 'Established' "$CREATE" && rg -q 'Partial' "$CREATE" && rg -q 'Absent' "$CREATE"; then
		pass "create.md: namespace classification preserved"
	else
		fail "create.md: namespace classification lost"
	fi

	if rg -q 'Phase 10A' "$CREATE" && rg -q 'Phase 10B' "$CREATE"; then
		pass "create.md: review/supervisor phases (10A/10B) preserved"
	else
		fail "create.md: review/supervisor phases lost"
	fi

	if rg -q 'Validate the provided' "$CREATE"; then
		pass "create.md: slug-first guard preserved"
	else
		fail "create.md: slug-first guard lost"
	fi
fi

# --- 8. /init contract (Pi-native init: compiler, refresh, six-file packet, boilerplate, crash-safe) ---
echo "[Check 8/8] /init contract — compiler, refresh, packet, boilerplate, crash-safe..."

INIT="$ROOT/.pi/prompts/init.md"

if [ ! -f "$INIT" ]; then
	fail "init.md missing"
else
	# New flags: --from and --refresh (RED until P4.2)
	if rg -q -- '--from' "$INIT" && rg -q -- '--refresh' "$INIT"; then
		pass "init.md: --from and --refresh grammar present"
	else
		fail "init.md: missing --from/--refresh grammar"
	fi

	# Removed modes: --context/--user/--all absent (RED until P4.2)
	rg_neg '--context|--user|--all' "$INIT" "init.md: old modes (--context/--user/--all) absent"

	# Six-file packet: AGENTS.md + .pi/{tech-stack,ROADMAP,state,user,memory}.md (RED until P4.2)
	if rg -q 'AGENTS\.md' "$INIT" && rg -q '\.pi/tech-stack\.md' "$INIT" && rg -q '\.pi/ROADMAP\.md' "$INIT" && rg -q '\.pi/state\.md' "$INIT" && rg -q '\.pi/user\.md' "$INIT" && rg -q '\.pi/memory\.md' "$INIT"; then
		pass "init.md: full six-file packet referenced"
	else
		fail "init.md: missing one or more of the six packet files"
	fi

	# No line cap: old <60/max 150 cap removed (RED until P4.2)
	rg_neg '<60 lines|max 150' "$INIT" "init.md: old AGENTS line cap absent"

	# Managed boilerplate markers (RED until P4.2)
	if rg -q 'pi:init:boilerplate:start' "$INIT" && rg -q 'pi:init:boilerplate:end' "$INIT"; then
		pass "init.md: managed boilerplate markers present"
	else
		fail "init.md: missing managed boilerplate markers"
	fi

	# Byte-identical boilerplate: init.md interior == fixture (RED until P4.2)
	BOILERPLATE="$ROOT/.opencode/artifacts/pi-native-init/boilerplate.md"
	if [ -f "$BOILERPLATE" ] && node -e 'const fs=require("node:fs");const a="<!-- pi:init:boilerplate:start -->",b="<!-- pi:init:boilerplate:end -->";const x=p=>{const s=fs.readFileSync(p,"utf8"),i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0)throw Error("markers");return Buffer.from(s.slice(i+a.length,j));};if(!x(process.argv[1]).equals(x(process.argv[2])))throw Error("drift")' "$INIT" "$BOILERPLATE" 2>/dev/null; then
		pass "init.md: boilerplate interior byte-identical to fixture"
	else
		fail "init.md: boilerplate interior drifts from fixture (or markers missing)"
	fi

	# Old .opencode output paths absent (RED until P4.2)
	rg_neg '\.opencode/(tech-stack|roadmap|state|user)\.md' "$INIT" "init.md: old .opencode output paths absent"

	# Readiness outcomes: READY/PARTIAL/BLOCKED (RED until P4.2)
	if rg -q 'READY' "$INIT" && rg -q 'PARTIAL' "$INIT" && rg -q 'BLOCKED' "$INIT"; then
		pass "init.md: READY/PARTIAL/BLOCKED readiness outcomes present"
	else
		fail "init.md: missing readiness outcomes (READY/PARTIAL/BLOCKED)"
	fi

	# State schema v1 + reload barrier (RED until P4.2)
	if rg -q 'schema_version: 1' "$INIT" && rg -q 'context_reload_required' "$INIT"; then
		pass "init.md: state schema v1 + reload barrier present"
	else
		fail "init.md: missing state schema v1 or reload barrier"
	fi

	# Crash-safe refresh: partial before mutation, ready last (RED until P4.2)
	if rg -qi 'partial.*before|before.*mutat' "$INIT" && rg -qi 'ready.*last|last.*ready' "$INIT"; then
		pass "init.md: crash-safe refresh ordering declared"
	else
		fail "init.md: missing crash-safe refresh ordering (partial-before-mutation, ready-last)"
	fi

	# Source bounds (RED until P4.2)
	if rg -q '1,048,576' "$INIT" && rg -q '65,536' "$INIT"; then
		pass "init.md: source size bounds present"
	else
		fail "init.md: missing source size bounds (1,048,576 / 65,536)"
	fi

	# Provenance + untrusted source (RED until P4.2)
	if rg -q -i 'provenance' "$INIT" && rg -q -i 'sha256' "$INIT" && rg -q -i 'untrusted' "$INIT"; then
		pass "init.md: provenance + untrusted-source declared"
	else
		fail "init.md: missing provenance or untrusted-source declaration"
	fi

	# Monotonic roadmap-ID (RED until P4.2)
	if rg -q 'last_issued_id' "$INIT"; then
		pass "init.md: monotonic roadmap-ID (last_issued_id) present"
	else
		fail "init.md: missing monotonic roadmap-ID (last_issued_id)"
	fi

	# Reload barrier: /reload present (RED until P4.2)
	if rg -q -- '/reload' "$INIT"; then
		pass "init.md: /reload reload barrier present"
	else
		fail "init.md: missing /reload reload barrier"
	fi

	# Input/appendix drift detection (RED until P4.2)
	if rg -qi 'drift' "$INIT" && rg -qi 're-read|re-hash|revalidat' "$INIT"; then
		pass "init.md: input/appendix drift detection declared"
	else
		fail "init.md: missing drift detection (re-read/re-hash before mutation)"
	fi

	# Preserved: --deep retained (GREEN)
	if rg -q -- '--deep' "$INIT"; then
		pass "init.md: --deep flag retained"
	else
		fail "init.md: --deep flag lost"
	fi

	# Preserved: $ARGUMENTS title convention (GREEN)
	if rg -q '\$ARGUMENTS' "$INIT"; then
		pass "init.md: \$ARGUMENTS template convention retained"
	else
		fail "init.md: \$ARGUMENTS template convention lost"
	fi

	# Preserved: validate commands actually work (GREEN)
	if rg -qi 'validate.*actually works|actually works.*validate|validate each' "$INIT"; then
		pass "init.md: command validation behavior retained"
	else
		fail "init.md: command validation behavior lost"
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
