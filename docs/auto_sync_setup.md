# Auto-Sync Setup Guide for Codespaces

This guide describes how to set up auto-sync between GitHub commits and an active Codespace without manual sync.

2## 1. Requirements
- Global Options (PAT) with the following scopes:
  - repo
  - codespace
- A git hub repo with active codespace named properly

- A file located in .github/workflows/auto_sync_codespace.yml

- The project must have the devcontainer mounted in /workspaces/

### 2. Setup
1. Create a PAT with scopes:
  - repo
  - codespace
  - read:org

2. Store this PAT in Repository Settings under Secrets as "CODESPACE_PAT"

3. Add the following file in .github/workflows/auto_sync_codespace.yml with the content from the validated nobuild version.

### 3. How It Works
Once setup, any push to main will trigger the workflow and execute git pull in your active Codespace immediately.

### 4. Testing The
Use a test file to commit and observe the change in the Codespace after action completion.

This process ensures that your local development is always synced with the latest changes from the main branch automatically.