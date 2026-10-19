# STRATUM — common commands. Run `make help` for the list.
.PHONY: help setup lint typecheck test test-fast coverage check verify-lock lock-env web-dev web-test export reproduce-figures rescore expo

help:  ## show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

setup:  ## create the pinned environment (.venv) and install the git pre-commit hooks
	uv sync --frozen
	uv run pre-commit install

lint:  ## ruff lint + format check
	uv run ruff check .
	uv run ruff format --check .

typecheck:  ## mypy --strict on stratum/
	uv run mypy

test:  ## full test suite with coverage (no network)
	uv run pytest -m "not network" --cov --cov-report=term-missing:skip-covered

test-fast:  ## quick tests only
	uv run pytest -q -m "not slow and not network"

check: lint typecheck test  ## everything CI runs

verify-lock:  ## check the pre-registration against _locks/preregistration.lock
	uv run stratum verify-lock

lock-env:  ## re-resolve dependencies and regenerate requirements-colab.txt
	uv lock
	uv export --frozen --no-dev --no-hashes --no-emit-project --format requirements-txt -o requirements-colab.txt

web-dev:  ## website dev server (http://localhost:5173)
	npm --prefix web run dev

web-test:  ## website type-check, unit tests and number check
	npm --prefix web run typecheck
	npm --prefix web test
	npm --prefix web run numbers

export:  ## web data export (needs Drive data: run colab/08a_web_export_v1.ipynb instead)
	uv run stratum export-web-v1

RESULTS ?= web/public/data/$(shell python3 -c "import json;print(json.load(open('web/public/data/current.json'))['build'])")/results.json

reproduce-figures:  ## redraw every results figure from results.json (RESULTS=path to override)
	uv run stratum reproduce-figures --results $(RESULTS) --out reports/figures_reproduced

rescore:  ## recompute H1/H2 from the release data: make rescore RELEASE=path/to/unzipped/release
	@test -n "$(RELEASE)" || { echo "Usage: make rescore RELEASE=path/to/the/unzipped/release/folder"; exit 1; }
	uv run stratum rescore --release "$(RELEASE)"

expo:  ## offline expo build for the Summit booth (web/expo-build/; see docs/expo_checklist.md)
	npm --prefix web run build:expo
