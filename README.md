# WikiMaster Farm Bot Automation

## Major Issue !

The API for temporary mail as been spoted & the mails used are all blocked. Im actually looking for a new API or a way to create free & temporary mails.

## 📝 Description

This project is an automated farming bot script for the WikiMaster website. 
It programmatically launches multiple Google Chrome instances with a custom built-in extension, and orchestrates their interactions by synchronizing them through a local server.

The system relies on 3 types of account configurations:
- **1 Main Account**: The destination account. It logs in with your real credentials and automatically accepts friend requests and trade offers (verifying the sender's identity).
- **1 Intermediate Account**: A temporary account serving as a bridge. It receives the inventory from the farm bots, and after accumulating enough trades, it transfers all its cards and coins to the main account before deleting and recreating itself.
- **X Bot / Farm Accounts**: Temporary accounts (created with disposable emails via the mail.tm API) that autonomously sign up, solve Cloudflare Turnstile captchas, open card packs, claim achievements, and transfer their entire loot to the intermediate account. Once finished, they log out and restart the cycle infinitely.

The Chrome windows will automatically adapt to your screen resolution. A 10-second delay is implemented between each bot launch to respect the Mail.tm API rate limits.

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

### What happens when the script starts?
1. The script cleans the temporary `tmp/` folder.
2. It starts the local server and opens the defined number of Chrome browsers, staggering them by 10 seconds to bypass API rate limits.
3. It displays a color-coded **CLI Dashboard** in your terminal tracking the real-time status of all running accounts (Main, Intermediate, Bots) and the intermediate trade counter.
4. The main account logs in and waits for friend and trade requests.
5. The intermediate and bot accounts autonomously sign up using disposable emails and fetch OTP codes.
6. Bots retrieve their packs, claim achievements, and chain trade offers until all loot is funneled to the intermediate account, and eventually to the main account.
7. Bots automatically log out and restart the loop to farm infinitely.
