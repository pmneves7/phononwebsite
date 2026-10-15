# Magnon integration

The magnon page reuses the site's structure renderer, appearance controls,
Highcharts dispersion selection, and movie tools. It adds spin arrows and tip
paths. No solver runs in the browser and no browser dependency was added.

## Try it

```sh
npm ci
npm run build:site
python3 -m http.server 8000 --directory build
```

Open the [magnon viewer](../../magnon.html). Choose an example, click a branch,
and try **center on atom** and **tip path**. FeI₂ includes SU(N) modes;
Magnopy's elliptic example shows unequal transverse amplitudes.

## Code map

- `src/magnonjson.js`: shared file reader and spin motion.
- `src/magnoncrystal.js`, `magnongeometry.js`: arrows and tip paths.
- `src/magnonhighcharts.js`, `magnonwebpage.js`: chart and controls.
- `exporters/`: independent Sunny, SpinW, and Magnopy adapters and tests.

[JSON format](FORMAT.md) · [Validation](VALIDATION.md)
