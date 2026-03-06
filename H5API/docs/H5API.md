# H5API Quick Guide

## Purpose

H5API is a small Flask service for browsing filesystem-stored HDF5 files.

It provides:
- browser UI (`GET /`)
- JSON browse API (`GET /api/browse`)
- health endpoint (`GET /health`)

## Runtime defaults

- Host: `0.0.0.0`
- Port: `5100`
- Debug: from `DEBUG` env flag

## Storage model

Filesystem-only, with environment-based root selection.

Variables:
- `STORAGE_ROOT`
- `STORAGE_PATH_LINUX`
- `STORAGE_PATH_WINDOWS`

## Core behavior

- path-safe prefix normalization
- immediate child listing (not recursive)
- HDF5 extension filtering (`.h5`, `.hdf5`, `.hdf`)
- UTC timestamp metadata for file entries
- breadcrumbs generated from current prefix

## Read next

- `H5API/docs/H5API_IMPLEMENTATION.md`
- `H5API/docs/API_REFERENCE.md`
