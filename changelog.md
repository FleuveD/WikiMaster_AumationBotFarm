# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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