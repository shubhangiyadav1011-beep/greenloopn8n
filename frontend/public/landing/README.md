# GreenLoop public experience

This directory contains the supplied `greenloop-3d/dist` build, imported with
`node scripts/import-public-site.mjs` from the repository root. The import
preserves the built presentation and its local assets, rewrites asset URLs to
`/landing/`, and connects **Enter platform** to `/app`.

After editing and rebuilding `greenloop-3d`, run the import command again, then
`npm.cmd run build`. Verify the integration with
`node scripts/check-public-site.mjs`.

The public page uses a separate document so its CSS and WebGL controller do not
affect authenticated workspaces. Vite serves it at `/` during development. The
production build retains the React entry as `app.html` and installs this page
as `index.html`; the backend selects the appropriate document for each route.

See `ASSETS.md` and the license files in `assets/` for asset provenance.
