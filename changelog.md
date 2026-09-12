# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-12

### Added
- **CLI Dashboard**: Added a real-time, color-coded terminal dashboard displaying the live status of all accounts (Main, Intermediate, Bots) and the intermediate trade counter.
- **Browser Audio Muting**: Added the `--mute-audio` flag to Playwright launch arguments to mute all automated browser instances.

### Fixed
- **Cloudflare Turnstile Clicker**: Fixed a critical issue where Playwright failed to find the Turnstile checkbox due to iframe DOM obfuscation. Replaced inner-DOM querying with a robust coordinate offset click (`x: 30, y: 32`) directly on the iframe container.
- **Infinite CPU Spin**: Fixed a silent infinite loop in the `launcher.js` Cloudflare auto-clicker when the iframe disconnected.
- **Form Validation Sync**: Fixed `auth.js` prematurely assuming Turnstile was solved. The bot now strictly waits for the "Créer mon compte" button to become enabled.
- **React Checkbox State**: Fixed a bug where automated clicks on signup checkboxes (TOS and Age) were ignored by React's internal state. Implemented a robust method that clicks the wrapping `<label>` and dispatches native `change` and `input` events to guarantee form validation.
- **Intermediate Trade Race Condition**: Fixed a bug where the intermediate account would exceed the 45-trade limit due to asynchronous storage updates. The trade counter is now updated synchronously during the loop iteration.
- **Intermediate Signup Loop**: Fixed a bug where the intermediate account would not automatically redirect to `/signup` after logging out. Added the `intermediate` profile to the `launcher.js` auto-redirect logic.
- **Intermediate Achievements Claiming**: Fixed a condition in `achievements.js` so that the intermediate account is correctly allowed to claim its achievements before sending its inventory to the main account.

## [1.0.1] - 2026-09-12

### Added

- **Author and License**: Added `author` and `license` fields to `package.json`.
- **GitHub Repository**: Added `repository` field to `package.json`.
- **Keywords**: Added `keywords` array to `package.json` for better searchability.

## [1.0.0] - 2026-09-12

### Added

- **Multi-Browser Orchestration**: Launch and synchronize multiple Chrome instances (Main, Intermediate, and Bot Farm) via a local Socket.IO server.
- **Automated Account Creation**: Fully autonomous signup using disposable emails via the `mail.tm` API.
- **Cloudflare Turnstile Solver**: Automatic detection and solving of Turnstile captchas using Playwright frame interactions.
- **OTP Polling**: Background scripts automatically fetch and submit email verification codes.
- **Automated In-Game Flow**: Bots autonomously add friends, open card packs, claim achievements, and send trade offers.
- **Automated Collection Flow**: Main and Intermediate accounts automatically accept friend requests and incoming trade offers strictly from trusted farm bots.
- **Infinite Farming Loop**: Bots automatically log out and recreate new accounts to farm continuously.
- **API Rate Limit Handling**: Implemented a 10-second staggered launch delay and exponential backoff retries for `mail.tm` API requests to prevent HTTP 429 errors.
- **Stealth Capabilities**: Integration of `puppeteer-extra-plugin-stealth` to bypass basic browser automation detection.
- **Temporary Profile Cleaning**: Automatic deletion of the `/tmp/` directory on startup to prevent session leaks and free up space.