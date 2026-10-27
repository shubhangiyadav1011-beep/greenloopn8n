# GreenLoop visual assets

The photographs were recreated using the built-in ImageGen tool from the user's supplied video frames and reference collage. WebP encoding is used for the website. Original photography was not available; the generated backgrounds are visual reconstructions.

## Current collage recreation

| Asset | Project path | Use |
| --- | --- | --- |
| Golden-hour glass architecture | `dist/assets/hero-v2.webp` | Hero |
| Recoverable building structure | `dist/assets/assets-v2.webp` | Assets, passport and platform panels |
| Crane and site workers | `dist/assets/recovery-v2.webp` | Recovery, with beam and lifting rig rendered in Three.js |
| Surveyor and recovered beam | `dist/assets/identify-v2.webp` | Identification |
| Warehouse I-beam | `dist/assets/inspection-v2.webp` | Inspection scan scene |
| Loaded delivery truck | `dist/assets/logistics-v2.webp` | Logistics |
| Aerial construction city | `dist/assets/network-v2.webp` | Network |
| Isolated recovered steel beam | `dist/assets/beam-product.webp` | Non-WebGL fallback and material thumbnail |
| Recovered facade glass | `dist/assets/glass-product.webp` | Marketplace and material details |
| Recovered concrete panels | `dist/assets/concrete-product.webp` | Marketplace and material details |
| Commercial air handling unit | `dist/assets/hvac-product.webp` | Marketplace and material details |
| Original generated site interior | `dist/assets/opportunity.webp` | Reference material imagery |
| Original generated truck/site scene | `dist/assets/matching.webp` | Verification & impact background |

The earlier video assets `hero.webp`, `identify.webp` and `inspection.webp` are retained with the source for reuse.

### Generation briefs

Each collage panel was cropped as an analysis reference. Generation instructions removed all interface text, logos, labels, glass cards, borders, scan lines and other overlays, reconstructing the underlying architecture and preserving the reference's composition, dark forest-green/amber grading and wide cinematic framing.

Specific scene briefs retained the modern glazed facade at sunset; the recoverable building structure; the crane and workers; the surveyor beside the steel girder; the warehouse beam; the loaded road-going truck; and the aerial construction city. In the recovery asset, the suspended beam and lifting chains were removed so the code-native 3D asset could occupy that space. The product cutout requested a realistic worn steel I-beam with a transparent background and no labels.

The three additional product photographs were generated as neutral light-gray studio catalog images of recovered framed glass on a rack, stacked precast concrete panels on timber bearers, and a galvanized commercial HVAC unit. Each brief requested a complete three-quarter view, realistic surface wear and shadows, with no writing, logo or UI.

Earlier video assets used the same interface-removal approach at approximately 0 s (hero), 1 s (opportunity), 3 s (identification), 4.5 s (inspection) and 7 s (truck and site).

## Code-native visuals and third-party assets

- Steel model: beveled I-section, chain links, lighting and deterministic worn-steel canvas texture authored in `src/scene-engine.js`. Glass frames and panes, textured concrete slabs, and the HVAC housing, grille and fan are authored in `src/material-models.js`. No external 3D model downloads.
- Icons, scan lattice, score ring, diagrams and routes: original inline SVG/CSS.
- Passport QR: generated from the string `GREENLOOP SAMPLE | GL/001 | Structural Steel | S355 | 6.2 m | 2.4 t`; it encodes a sample record, not an external URL.
- India outline: derived from `world-atlas@2.0.2`, `countries-50m.json`, based on Natural Earth. Projection and city overlays generated for this site. The screenshot revision reduces the network to eight non-crossing connections and adds separate dark city-label backgrounds. World Atlas license included at `dist/assets/world-atlas-LICENSE.txt`. Source: https://github.com/topojson/world-atlas
- Inter variable font: Latin normal WOFF2 from `@fontsource-variable/inter@5.3.0`. SIL Open Font License included at `dist/assets/Inter-OFL.txt`. Source: https://github.com/rsms/inter
- Three.js: pinned in package.json; its bundled MIT notice is preserved in the application bundle. Source: https://github.com/mrdoob/three.js

No external image, font, model or CDN request is needed to view the built website.
