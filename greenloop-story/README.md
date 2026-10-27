# GreenLoop — 13-chapter scroll experience

A Tailwind CSS website recreated from the supplied GreenLoop reference collage, with scroll-controlled Three.js assets, cinematic photographic backgrounds and responsive layouts. The screenshot revision adds a large GREENLOOP hero, readable numbered building callouts, green marketplace cards, and a simplified India network.

## Open or run

The built site is in `dist/`. Open `dist/index.html` directly, keeping its assets beside it. JavaScript, fonts, photography and the 3D renderer are bundled locally; viewing the build needs no installation or API key.

To edit, use Node.js 20 or later:

```bash
npm ci
npm run build
npm run check
npm run preview
```

Open http://localhost:4173. The preview command serves the existing build; rebuild after editing.

## Chapters

| Chapter | Reference scene | Motion and interaction |
| --- | --- | --- |
| 01 | Hero | Large GreenLoop heading, tagline, camera push and guided story |
| 02 | Valuable assets | Four numbered cards with attached directional lines and matching targets |
| 03 | Recovery | Real beveled 3D I-beam, lifting chains and recovery stages |
| 04 | Identification | Asset identity, photo previews and passport navigation |
| 05 | Inspection & verification | Perspective scan grid and staged checklist |
| 06 | Material passport | 3D model, QR record, documents, photos and history |
| 07 | Marketplace | Green cards, four 3D material models, category tabs and five filters |
| 08 | Matching engine | Shared 3D asset, drawn match score and suitability factors |
| 09 | Procurement decision | Animated price comparison and working cost calculator |
| 10 | Order & booking | Five-stage order illustration, 3D material and terms |
| 11 | Logistics & delivery | Route marker, delivery milestones and truck background |
| 12 | Verification & impact | Receipt record, recovered quantity and calculated savings |
| 13 | GreenLoop network | Eight clear routes, separate city labels and moving route markers |

The supplied collage contains chapters 1–11 and 13. Chapter 12, **Verification & impact**, follows the user's selected completion for the missing panel. It uses the same visual language.

Scroll position selects the destination of the presentation. The visual timeline eases toward it, completes the scene animation, and holds that scene for at least three seconds before continuing. If a visitor scrolls quickly through multiple chapters, the story finishes each chapter in order. Scrolling upward releases an active hold and reverses the motion. Native wheel, touch and scrollbar input work alongside the chapter menu, arrow keys, Page Up/Down and Home/End. The chapter menu and navigation buttons jump straight to the selected chapter and play its entrance. The guided tour starts only when selected, holds each completed chapter for three seconds, and manual scrolling stops it. All four materials have a 3D viewer with pointer dragging and arrow keys. The marketplace search bar was removed as requested; global site search remains in the header.

The reference is a small desktop collage. Desktop placement follows it; mobile and tablet layouts adapt its hierarchy. `prefers-reduced-motion` switches to completed still scenes. Unsupported or unavailable WebGL falls back to the included material photograph.

## Source files

| File | Purpose |
| --- | --- |
| `src/index.html` | All 13 chapter layouts, navigation, dialogs and SVG icons |
| `src/input.css` | Base Tailwind theme, glass panels and responsive rules |
| `src/refinements.css` | Revised hero, callouts, green cards, map and motion styling |
| `src/style-entry.css` | Ordered Tailwind/CSS build entry |
| `src/app.js` | Scroll control, modal interactions, filtering, tour and calculations |
| `src/journey-data.js` | Sample inventory, filter logic and scroll-state calculations |
| `src/story-clock.js` | Smooth visual timeline and minimum three-second reading hold |
| `src/scene-overlays.js` | Responsive callout geometry and network-route animation |
| `src/material-models.js` | Glass, concrete and HVAC geometry with assembly animations |
| `src/scene-engine.js` | Three.js I-beam geometry, procedural steel texture, rig and cameras |
| `src/network-map.svg` | Geographic India outline, city markers and connections |
| `dist/assets/` | Local images, Inter font, QR and asset licenses |
| `scripts/build.mjs` | Tailwind compilation, esbuild bundling and inline map assembly |
| `scripts/check.mjs` | Navigation, data, asset, scroll-state and geometry verification |

A single WebGL canvas moves between the active chapter and the material viewer. The marketplace uses scissored rendering to show all four material models through that same canvas. Rendering follows scroll or pointer changes; there is no permanent background animation loop. The steel uses beveled geometry, a deterministic worn-metal texture, environmental reflections, warm lighting and shadows. The surrounding architecture remains photographic, with layered movement for depth.

## Connect your existing app

By default, **Enter platform** opens the local marketplace chapter. To point it at your real application, add this before the `app.js` script in `src/index.html`, then rebuild:

```html
<script>
  window.GREENLOOP_CONFIG = { platformUrl: '/app' };
</script>
```

The experience is a standalone presentation and UI demonstration. It does not replace or integrate the separate GreenLoop backend. No live inventory, payment, reservation or authentication service is connected. Sample record downloads are labeled as sample data.

To use this within a React/Vite application, mount it as a dedicated presentation route, retain the current app routes and backend, and port the scene markup and controller lifecycle into your component. The built files can also be served independently from a landing route.

## Adjusting the experience

- Change `--chapter-height` in `src/input.css` for scroll length: 180svh desktop, 195svh mobile, overridden in `src/refinements.css`.
- Change `READ_HOLD_MS` in `src/story-clock.js` to adjust the minimum reading pause (3000 ms). Reduced motion bypasses this delay.
- Motion thresholds and camera offset values are in `src/app.js` and `src/scene-engine.js`.
- Replace background WebP files when original full-resolution photographs are available.
- Edit sample material records in `src/journey-data.js`.
- Model proportions are an illustration, not a fabrication or engineering specification.

## Fidelity and verification

The reference layout, chapter order, color palette, headings and glass-panel style guide this reconstruction. It is not the original website source. Photography was recreated from the reference with ImageGen; Inter is the closest selected typeface. Exact original image pixels, font identity and animation timing cannot be recovered from a small static collage.

Reference network numbers, material specifications and verification badges are illustrative presentation content. No real engineering certificates were provided. The additional impact chapter uses the reference prices to calculate `(65000 − 38000) × 2.4 = ₹64,800` in material savings.

The production build, JavaScript syntax, chapter navigation targets, local assets, filtering, cost calculations, scroll-state continuity, reduced-motion states all four material geometries, and the minimum reading hold on all 13 chapters are checked. A DOM simulation checks interaction wiring and the WebGL fallback. Automated visual rendering in an actual browser was unavailable in this environment; desktop/mobile appearance and GPU motion still require a browser review.

Image and font provenance is in `ASSETS.md`.
