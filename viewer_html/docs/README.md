# Viewer HTML Docs

Documentation for the `viewer_html/` frontend.

## Start here

- `VIEWER_HTML.md` - quick onboarding guide (what this frontend does and how to run it)
- `VIEWER_HTML_IMPLEMENTATION.md` - full implementation walkthrough in code order
- `API_REFERENCE.md` - frontend-to-backend API usage and payload expectations
- `FILE_MAP.md` - file-by-file ownership map
- `OPERATIONS_AND_RUNBOOK.md` - run/deploy/troubleshooting guide
- `TESTING_AND_VALIDATION.md` - practical validation checklist

## Audience

These docs are for:
- new developers joining the project
- reviewers checking behavior and integration points
- maintainers debugging runtime UI/data flows

## Source of truth

Main implementation files:
- `viewer_html/index.html`
- `viewer_html/config/runtime-config.js`
- `viewer_html/js/app-viewer.js`
- `viewer_html/js/views/viewerView.js`
- `viewer_html/js/api/*.js`
- `viewer_html/js/state/*.js`
- `viewer_html/js/components/viewerPanel/runtime/*.js`

If docs and code differ, code is authoritative. Update docs in the same change when behavior changes.
