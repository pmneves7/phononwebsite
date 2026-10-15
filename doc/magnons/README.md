# Magnon viewer

Open the [magnon viewer](../../magnon.html), choose an example or load a JSON
file, then click a point on a dispersion branch. Drag to rotate and scroll to zoom.

## Export a calculation

Use the exporter for your calculation:

- [Sunny](../../exporters/sunny/README.md) — Julia
- [SpinW](../../exporters/spinw/README.md) — MATLAB
- [Magnopy](../../exporters/magnopy/README.md) — Python

The exporters keep your solver's model and convert its modes to a common JSON
file. Your colleague only needs the website to view it. Files loaded with the
file chooser stay in the browser.

## Controls

- **Amplitude / Speed / Phase:** adjust the motion or pause at a chosen phase.
- **Repetitions:** show more magnetic cells.
- **Atom / Bonds:** use the same appearance controls as the phonon viewer.
- **Spin arrows:** change length, color, cylinder/cone width, and cone fraction.
  Widths are diameters in Å; length is a display scale.
- **Center on atom:** place the arrow's midpoint on the atom.
- **Tip path:** show the tip's complete trajectory through one cycle.
- **GIF / WebM:** save one animation cycle.

Arrows show spin motion, not g-weighted magnetic moments. Amplitude and playback
speed are visual scales. Mode weights show relative spin-dipole weight, not
neutron intensity. A mode with no dipole component has no arrow motion.

For another exporter, see the [JSON format](FORMAT.md).
