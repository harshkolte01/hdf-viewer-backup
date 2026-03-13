# Host File Selection Guide

This document explains how an external or host file-selection UI should open the viewer in `spa/index.html`.

Current SPA shell behavior:
- the main panel is display-only
- metadata renders below the tree in the left sidebar
- the host integration still only needs to pass the selected backend file key

## Core Variable

Use this variable name:

```js
fileKey
```

Meaning of `fileKey`:

- the backend object key / relative file path
- the same path the backend expects in `/files/<key>/...`
- not a full Windows path
- not a full API URL

Valid examples:

```text
hdf5/sample.hdf5
test1.h5
Folder_1/random_05.h5
```

Invalid examples:

```text
C:\data\sample.hdf5
http://localhost:5000/files/hdf5/sample.hdf5
```

## Current Viewer Contract

`spa/index.html` supports these URL parameters:

- `?file=<backend-object-key>` -> primary contract
- `?path=<backend-object-key>` -> normalized to `file`
- `?key=<backend-object-key>` -> normalized to `file`
- `?filePath=<backend-object-key>` -> normalized to `file`
- host global `file = "<backend-object-key>"` -> normalized to `file`

The shared viewer runtime finally reads:

```text
?file=<backend-object-key>
```

That read happens in:

- `spa/js/app-viewer.js`

The normalization from `path`, `key`, `filePath`, or the host `file` variable to `file` happens in:

- `spa/index.html`

## Radio Button Case

If each radio button represents one file, then the selected radio value should be the `fileKey`.

Example:

```html
<label>
  <input type="radio" name="file-select" value="hdf5/sample.hdf5" />
  sample.hdf5
</label>
```

Then:

```js
const selectedRadio = document.querySelector('input[name="file-select"]:checked');
const fileKey = selectedRadio.value;
```

So yes:

```text
fileKey = path of selected radio button
```

## If Host UI Is On The Same Page

If your selector HTML is rendered inside `spa/index.html`, use the helper already exposed by the page:

```js
window.openFileFromHostUi(fileKey);
```

Example with radios:

```html
<div id="host-selector">
  <label>
    <input type="radio" name="file-select" value="hdf5/sample.hdf5" />
    sample.hdf5
  </label>
  <label>
    <input type="radio" name="file-select" value="test1.h5" />
    test1.h5
  </label>
</div>
```

```js
document.addEventListener("change", function (event) {
  const radio = event.target;

  if (!(radio instanceof HTMLInputElement)) return;
  if (radio.name !== "file-select") return;

  const fileKey = radio.value;
  window.openFileFromHostUi(fileKey);
});
```

What `window.openFileFromHostUi(fileKey)` does:

1. writes `fileKey` into the `?file=` URL param
2. calls `window.actions.openViewer({ key: fileKey, etag: null })`
3. triggers the shared viewer to load that file

## If Host UI Is On Another Page

If the selector lives outside `spa/index.html`, navigate to the viewer page with the file key in the URL.

Example:

```js
const fileKey = "hdf5/sample.hdf5";
window.location.href = "/spa/index.html?file=" + encodeURIComponent(fileKey);
```

You can also use the accepted aliases:

```js
const fileKey = "hdf5/sample.hdf5";
window.location.href = "/spa/index.html?path=" + encodeURIComponent(fileKey);
```

But `file` is the preferred parameter.

## If The Viewer Is Already Open

If `spa/index.html` is already loaded and you want to switch files without full page reload:

```js
const fileKey = "hdf5/sample.hdf5";
window.openFileFromHostUi(fileKey);
```

If the host page updates a global `file` variable instead, call:

```js
file = "hdf5/sample.hdf5";
window.syncHostFileVariable();
```

If you want the direct logic, it is:

```js
function openFileFromHostUi(fileKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("file", fileKey);
  history.replaceState({}, "", url.pathname + url.search + url.hash);

  if (window.actions && typeof window.actions.openViewer === "function") {
    window.actions.openViewer({ key: fileKey, etag: null });

    if (typeof window.actions.loadFiles === "function") {
      window.actions.loadFiles();
    }
  }
}
```

## Recommended Pattern

Use this rule:

```text
selected file path -> save into fileKey -> pass fileKey to viewer
```

Most common example:

```js
const selectedRadio = document.querySelector('input[name="file-select"]:checked');
const fileKey = selectedRadio.value;
window.openFileFromHostUi(fileKey);
```

## Where To Edit If Contract Changes

If you want to change how incoming file selection works, check:

- `spa/index.html`
  - host URL normalization
  - `window.openFileFromHostUi(fileKey)`
  - `window.syncHostFileVariable()`

- `spa/js/app-viewer.js`
  - reading `?file=`
  - boot-time open behavior

## Summary

- variable name: `fileKey`
- value inside `fileKey`: backend relative file path
- selected radio button value should be that path
- preferred URL param: `file`
- same-page host UI should call: `window.openFileFromHostUi(fileKey)`
- host pages with a global `file` variable can call: `window.syncHostFileVariable()`
