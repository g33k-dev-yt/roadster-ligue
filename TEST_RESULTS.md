# Roadster Ligue — release checks

Date: 22 October 2026. Build: v1.1.1.

## Automated checks: PASS

Production build served with Vite preview. Chromium 156 / Playwright 1.64, Linux, software WebGL rendering.

19 functional assertions passed:

1. Ground support and stable ride height.
2. Acceleration and forward movement.
3. First jump and held-jump height.
4. Second jump.
5. Landing replenishes jumps.
6. Directional aerial flip.
7. Ramp transition and wall adhesion.
8. Boost acceleration and consumption.
9. Car-to-ball interaction and shot statistics.
10. Large boost-pad collection and cooldown.
11. Goal detection, scoring and scorer statistics.
12. Recorded-frame replay.
13. Kickoff reset.
14. Overtime on tied expiration.
15. Golden-goal match completion.
16. Six roadsters in 3v3 with model LODs.
17. AI participates and produces shot / goal events; transforms remain finite through simulated play.
18. Demolition, visibility and credited statistics.
19. Respawn.

New opening-flow checks passed: static first-launch warning before any WebGL canvas, explicit photosensitivity warning and satire statement, exact By-G33K branding, Not now does not launch the game, acknowledgement enables startup, opening menu, safety dialog, reduced-effects setting, 390×844 and 844×390 opening layouts, and the warning returns on reload despite saved preferences.

UI checks passed: garage paint and finish selection, saving / returning to play, controls and settings dialogs, keyboard acceleration and boost, pause and resume. Play button fits both 390×844 portrait and 844×390 landscape layouts. No JavaScript or shader errors were reported.

## Standalone offline check: PASS

The delivered HTML was loaded into an iframe with exactly `sandbox="allow-scripts"` and all network access disabled. It loaded the licensed model, rendered the interface and entered free play successfully. No JavaScript or console errors, or attempted HTTP/HTTPS requests, were reported. The embedded Barlow display font loaded successfully. Fonts, HDRI, model decoder, model data and full browser license notices are embedded.

## Repository-subpath hosting: PASS

The production build was served only under `/roadster-ligue/`, with no host-root asset fallback. All model, HDR, font, script and WebAssembly resources loaded and free play started. No root-path asset requests, HTTP failures, JavaScript errors or shader errors were reported.

## Tauri compile check: PASS

`cargo check --manifest-path src-tauri/Cargo.toml --locked` completed on Debian 13 x86_64 with Rust 1.99.1, Tauri 2.12.5 and WebKitGTK 2.54.0. The real Rust application, capability definitions, embedded frontend and Tauri configuration compiled successfully. This check does not claim a Windows/macOS installer or native graphics-driver test; the manual desktop workflow builds installers on native runners.

## Build and dependencies: PASS

- `npm run build`: successful.
- `npm audit`: 0 reported vulnerabilities at release time. This is a point-in-time dependency check, not a general security guarantee.

## Limits of testing

Windows/macOS desktop binaries, physical gamepad hardware, real phone touch screens and every browser / GPU combination have not been individually verified. Touch and standard Gamepad API input paths are implemented; permissions can be restricted by an embedding page. Arcade physics is not claimed to match Rocket League exactly. Networked multiplayer is not implemented.

## Packaging command correction

v1.1.1 forwards the Cargo lock flag using `npm run tauri -- build -- --locked`. Passing `--locked` directly to `tauri build` is not supported by the pinned CLI. The original workflow exposed this during the installer check; documentation and workflow invocation have been corrected.
