# WikiMaster Farm Bot Automation

## 📝 Description

This project is an automated farming bot script for the WikiMaster website. 
It programmatically launches multiple Google Chrome instances with a custom built-in extension, and orchestrates their interactions by synchronizing them through a local Socket.IO server.

The system relies on 3 types of account configurations:
- **1 Main Account**: The destination account. It logs in with your real credentials and automatically accepts friend requests and trade offers (verifying the sender's identity).
- **1 Intermediate Account**: A temporary account serving as a bridge. It receives the inventory from the farm bots, and after accumulating enough trades, it transfers all its cards and coins to the main account before restarting its cycle.
- **X Bot / Farm Accounts**: Farming accounts that autonomously sign up with highly realistic, randomly generated French pseudonyms (combining over 13,000 French words with diverse formatting). They solve Cloudflare Turnstile captchas, open card packs, claim achievements, and securely transfer their entire loot to the intermediate account. Once finished, they log out and restart the cycle infinitely.

The Chrome windows will automatically adapt to your screen resolution. A 10-second delay is implemented between each bot launch to respect external API rate limits.

## ✨ Key Features

- **Advanced Account Persistence**: The system maintains an `accounts.json` database of created accounts (up to 5,000 bots). Accounts are rotated with a 2-hour cooldown to bypass internal server limits, avoiding endless creations while farming infinitely.
- **Realistic Username Generation**: Bots use a dictionary of 13,000+ French words with multiple realistic naming patterns (e.g. `Loup2foret`, `ombre8034`, `Secret.`) to evade bot detection algorithms.
- **Resilient React Integration**: The bot natively handles React form limitations by simulating real keyboard interactions and dispatching native browser events, bypassing UI quirks like zero-balance trade deadlocks or double-confirmation modals.
- **Robust State Machine**: Chrome extensions and the Node server stay perfectly synchronized using Socket.IO, preventing trade overlapping and race conditions.
- **CLI Dashboard**: A dynamic, color-coded terminal dashboard allows you to monitor the state of each bot instance in real-time.

## 🛠️ Prerequisites

- **Node.js** installed on your machine.
- **Google Chrome** browser installed.

## ⚙️ Installation and Setup

1. **Install Dependencies**
   From the terminal, at the root of the project, install the required packages:
   ```bash
   npm install
   ```

2. **Configure the `.env` file**
   You must define your credentials in a `.env` file at the root of the project (at the same level as `package.json`). Here is an example of the expected configuration:
   ```env
   # Number of simultaneous farm bot windows (default: 1)
   BOT_COUNT=5

   # Main Account Information (REQUIRED)
   MAIN_ACCOUNT_NAME="your_wiki_username"
   MAIN_ACCOUNT_EMAIL="your_email@gmail.com"
   MAIN_ACCOUNT_PASSWORD="your_password"

   # Local communication server port
   PORT=3000
   ```
   *Note: The main account credentials are required and are used strictly locally by the script to automatically log you in.*

## 🚀 Usage

To start the automation, ensure that all your standard Chrome windows are closed, then run the following command:

```bash
npm start
```

### Flow of Execution
1. The script cleans the temporary `tmp/` folder.
2. It starts the local server and opens the defined number of Chrome browsers, staggering them by 10 seconds to bypass API rate limits.
3. It displays a color-coded **CLI Dashboard** in your terminal tracking the real-time status of all running accounts.
4. The main account logs in and waits for friend and trade requests.
5. The intermediate and bot accounts dynamically request assignments from the server (`CREATE_NEW` or `LOGIN` with an existing `accounts.json` account).
6. Bots gracefully inject OTP codes and solve captchas, robustly navigating React's virtual DOM.
7. Bots retrieve their packs, claim achievements, and chain trade offers.
8. Bots automatically log out and restart the loop.

## ⚠️ Disclaimer
This script is provided for educational purposes only. Automated botting may violate the Terms of Service of the targeted platform. Use at your own risk.
