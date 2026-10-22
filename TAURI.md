# Roadster Ligue — Tauri 2 desktop

The same frontend runs in a browser, at a static-hosting repository subpath, or inside Tauri. Desktop branding is **Roadster Ligue — By-G33K**, version **1.1.1**, app identifier `io.g33k.roadster-ligue`.

## Prerequisites

- Node.js 20.19+ (22 LTS recommended), npm.
- Rust **1.90+** (current stable recommended) via [rustup](https://rustup.rs/).
- OS-specific Tauri 2 prerequisites: <https://v2.tauri.app/start/prerequisites/>.
- Windows: Microsoft C++ Build Tools with the Desktop development with C++ workload and the WebView2 runtime.
- macOS: Xcode Command Line Tools.
- Linux: a desktop session and WebKitGTK 4.1; for Debian/Ubuntu builds:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev librsvg2-dev patchelf
```

Compile on the target operating system. A Linux machine does not directly produce a signed Windows or macOS installer.

## Development

```bash
npm ci
npm run desktop:dev
```

Tauri starts Vite and opens its native window. The warning appears before WebGL or audio is initialized, exactly as in the browser. The dev-only `localhost:5173` URL is used by the native webview, not by remote browser clients. Browser assets always use relative same-origin URLs.

## Production build

```bash
npm run tauri -- build -- --locked
```

For a regular local build, `npm run desktop:build` also works. In the locked command above, the second separator passes `--locked` to Cargo rather than to the Tauri CLI.

Output: `src-tauri/target/release/bundle/`.

- Linux: `.deb` and `.AppImage`, selected in `tauri.linux.conf.json`.
- Windows: NSIS `.exe` and WiX `.msi` installers.
- macOS: `.app` and `.dmg`.

Examples:

```bash
npm run tauri -- build --bundles deb,appimage -- --locked
npm run tauri -- build --bundles nsis -- --locked
npm run tauri -- build --bundles dmg -- --locked
```

These are **unsigned development builds**. They are not notarized, and Windows SmartScreen or macOS Gatekeeper may warn or block distribution. Production signing/notarization requires the developer's own certificates/accounts; no signing credentials are included. There is no auto-updater or telemetry.

### GitHub Actions

In **Actions → Tauri desktop installers → Run workflow**, choose `linux`, `windows`, `macos`, or `all`. Each job builds natively and uploads installers to its run's **Artifacts** section. Jobs do not publish releases or upload to an app store. Public GitHub Actions artifacts generally require signing into GitHub and expire after 30 days; run the workflow again to regenerate them.

## Structure & security

- `src-tauri/tauri.conf.json`: window, relative `dist/`, CSP and bundling.
- `src-tauri/Cargo.toml`, `Cargo.lock`, `build.rs`, `src/`: real Tauri 2 Rust application.
- `src-tauri/capabilities/main-window.json`: only core UI capabilities and HTTPS asset-credit links from an explicit domain allowlist.
- `src-tauri/icons/`: bundled native app icons.
- All models, fonts, HDR lighting, Draco decoder and license files are included locally; playing does not need a network connection after installation.
- No filesystem access, shell execution, native HTTP client or remote content privileges are granted to the frontend. External attribution links open in the OS browser through the Tauri opener plugin.
- CSP permits local assets, blob workers and WebAssembly compilation for Draco, not arbitrary remote scripts. CSS uses inline styles for paint swatches and HUD positioning.

WebGL 2 and audio availability depend on the platform's WebView2/WKWebView/WebKitGTK and graphics drivers. A successful Rust build is not a test of every OS's graphics drivers. See [TEST_RESULTS.md](TEST_RESULTS.md) for checks actually executed.

## Dependency notices

`NATIVE_DEPENDENCY_NOTICES.txt` is bundled with installers and records exact source-package URLs, declared licenses and the notices supplied by locked Rust crates (including optional/build-only/platform-specific packages). If Cargo.lock changes, regenerate with `python3 tools/native-notices.py`. This collector is not a legal audit; system libraries retain their own licenses.
