Not just `file` alone.

You need these pieces:

1. The viewer HTML block must already be present in the company page.
2. The viewer CSS and JS files must already be loaded.
3. Then yes, the company page must provide:
```html
<script>
  var file = "hdf5/sample.hdf5";
</script>
```

And yes, `file` must contain the backend-relative file path/key, for example:
```js
var file = "hdf5/sample.hdf5";
```

Not these:
```js
var file = "C:\\data\\sample.hdf5";
var file = "http://localhost:5000/files/hdf5/sample.hdf5";
```

If the viewer markup/scripts are already included, then the extra thing the company page needs to provide is the `file` variable with the path.

If `file` changes after page load, then also call:
```js
window.syncHostFileVariable();
```

So short answer: yes, `file` is the main integration value, and it must be the correct relative path. But it only works if the viewer HTML/CSS/JS is already on that page.