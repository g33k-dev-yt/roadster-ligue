// Works at /, a GitHub Pages repository subpath, and Tauri's custom protocol.
// The standalone packer supplies a synthetic base for file: and opaque srcdoc origins.
const base = globalThis.__ROADSTER_ASSET_BASE__ || new URL(import.meta.env.BASE_URL, document.baseURI).href;
export const assetUrl = name => new URL(`assets/${name}`, base).href;
