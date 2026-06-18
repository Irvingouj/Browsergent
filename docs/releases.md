# Release process

How Browsergent is packaged, signed, published, and auto-updated — outside the Chrome Web Store.

## Current state (as of v0.1.0)

This is already set up. You do not need to redo these steps. Recorded here so the state is reproducible if anything is lost.

| Thing | Value / Location |
|---|---|
| Extension ID | `hlcnllaoopakidkeckkecaodjkihpnnm` |
| CRX signing key (GitHub secret) | `CRX_PRIVATE_KEY` |
| CRX signing key (local backup 1) | `~/Library/Application Support/Browsergent/crx-signing-key.pem` |
| CRX signing key (local backup 2) | `~/.ssh/browsergent-crx-signing-key.pem` |
| gh-pages deploy key (GitHub secret) | `GH_PAGES_DEPLOY_KEY` |
| gh-pages deploy key (repo deploy key) | `gh-pages deploy (release workflow)` — read/write |
| Auto-update URL | `https://irvingouj.github.io/Browsergent/update.xml` |
| Manifest `update_url` | points at the above |
| Release artifacts | `.crx` + `.zip` attached to each tagged GitHub Release |

**Key fingerprint (SHA-256 of the public key):** `ca435e93f1d077701f230d52942987129aff0d4664d22386e146f88a2c76037e`.

Use this to verify any backup matches the key in production:

```bash
openssl rsa -in <backup.pem> -pubout 2>/dev/null | openssl sha256
# must print: ca435e93f1d077701f230d52942987129aff0d4664d22386e146f88a2c76037e
```

## TL;DR for maintainers

1. Bump `version` in `package.json`.
2. `git commit -m "release vX.Y.Z" && git tag vX.Y.Z && git push origin main vX.Y.Z`.
3. The `Release` workflow builds the `.crx` + `.zip`, attaches them to a GitHub Release, and publishes `update.xml` to the `gh-pages` branch. Chrome picks up the update within a few hours.

The user-facing install/upgrade story lives at the bottom of this doc.

## Architecture

```mermaid
flowchart LR
  Tag["git tag vX.Y.Z"] --> Workflow[".github/workflows/release.yml"]
  Workflow --> Build["npm run build → dist/"]
  Build --> Pack["scripts/package-crx.mjs"]
  Secret["CRX_PRIVATE_KEY\nGitHub secret"] -. signs .-> Pack
  Pack --> CRX["release/browsergent-X.Y.Z.crx"]
  Pack --> ZIP["release/browsergent-X.Y.Z.zip"]
  Pack --> XML["release/update.xml"]
  CRX -. attached to .-> Release["GitHub Release vX.Y.Z"]
  ZIP -. attached to .-> Release
  XML -. pushed to .-> Pages["gh-pages branch\n→ GitHub Pages"]
  Installed["Installed extension\nupdate_url in manifest"] -->|"polls every few hours"| Pages
  Pages -->|"if version > installed"| CRX
  CRX -->|"auto-installed"| Installed
```

Three moving parts:

1. **`.pem` private key** — pins the extension ID forever. Stored as a GitHub Actions secret named `CRX_PRIVATE_KEY`.
2. **`update.xml`** on `gh-pages` — Chrome's auto-update manifest. Hosted at `https://irvingouj.github.io/Browsergent/update.xml` via GitHub Pages.
3. **`.crx` + `.zip`** attached to each tagged release.

### Why not the Chrome Web Store?

Google will not approve an extension with a top-level runtime-driven JS agent that can act on arbitrary pages. The self-hosted CRX3 + auto-update path is the standard alternative. Users install once via `chrome://extensions`, then updates flow automatically.

## The CRX private key (read this once)

The `.pem` private key does two things:

1. **Signs each `.crx`** so Chrome trusts it (tampered bytes → signature mismatch → Chrome refuses to load).
2. **Derives the extension ID** — the ID is a pure function of the key. Change the key → the ID changes → every installed user must reinstall.

This is why the key is permanent and backed up in multiple places. It is **not** rotatable like an API key once real users exist.

### Current key

- **GitHub secret `CRX_PRIVATE_KEY`** — what CI uses to sign.
- **Two local backups** (see "Current state" table above). Both verified against fingerprint `ca435e93...`.

### If you lose the key

The extension ID changes. Every installed user must uninstall the old one and install the new one. There is no migration path. This is why the key is stored as a GitHub secret AND backed up offline in two locations.

### Recovering / restoring the key

If the GitHub secret is lost but a local backup survives:

```bash
gh secret set CRX_PRIVATE_KEY < "$HOME/Library/Application Support/Browsergent/crx-signing-key.pem"
```

Verify the restored secret produces the same fingerprint and the same extension ID (`hlcnllaoopakidkeckkecaodjkihpnnm`) before tagging.

### Generating a brand-new key (only if every backup is lost)

```bash
# 1. Generate a 2048-bit RSA key in the format crx3/Chrome expects.
openssl genrsa -out crx-signing-key.pem 2048

# 2. Store it as a GitHub Actions secret named CRX_PRIVATE_KEY.
gh secret set CRX_PRIVATE_KEY < crx-signing-key.pem

# 3. Back it up in two local locations.
mkdir -p "$HOME/Library/Application Support/Browsergent"
cp crx-signing-key.pem "$HOME/Library/Application Support/Browsergent/crx-signing-key.pem"
cp crx-signing-key.pem "$HOME/.ssh/browsergent-crx-signing-key.pem"
chmod 600 "$HOME/Library/Application Support/Browsergent/crx-signing-key.pem"
chmod 600 "$HOME/.ssh/browsergent-crx-signing-key.pem"

# 4. Note the new extension ID — every existing user must reinstall.
# 5. Delete the working copy — it must never be committed.
rm crx-signing-key.pem
```

`.gitignore` already ignores `*.pem`.

## One-time GitHub Pages setup (already done)

The release workflow pushes `update.xml` to the `gh-pages` branch. This was set up once:

1. Dedicated deploy key generated:

   ```bash
   ssh-keygen -t ed25519 -f gh-pages-deploy-key -N "" -C "gh-pages@browsergent"
   # public key  → repo Settings → Deploy keys → Add → Allow write
   # private key → repo Settings → Secrets → New secret named GH_PAGES_DEPLOY_KEY
   ```

2. Repo Settings → Pages:
   - Source: **Deploy from a branch**
   - Branch: **`gh-pages`** / **`/ (root)`**

3. Confirmed `https://irvingouj.github.io/Browsergent/update.xml` serves after the first release.

`update.xml` points Chrome at the release's `.crx` URL. Chrome downloads and installs the update without any user action.

## Publishing a release

Bump, tag, push:

```bash
# Bump version in package.json (e.g. 0.1.0 → 0.2.0)
$EDITOR package.json
git commit -am "release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

The workflow:
1. Verifies tag matches `package.json` version (fails if mismatched).
2. Runs typecheck + lint + unit tests.
3. Builds and packages `.crx` + `.zip` + `update.xml`.
4. Creates/updates the GitHub Release with artifacts attached.
5. Pushes `update.xml` to `gh-pages`.

The workflow fails loudly if:
- Tag version ≠ `package.json` version
- `CRX_PRIVATE_KEY` secret is missing
- Typecheck/lint/tests fail
- `GH_PAGES_DEPLOY_KEY` is missing (no auto-update publishing)

## How users install

### First install

Send users to the release page:

```
https://github.com/Irvingouj/Browsergent/releases/latest
```

Two paths:

**Drag-and-drop `.crx` (easiest for most users):**
1. Download `browsergent-<version>.crx` from the latest release.
2. Open `chrome://extensions`.
3. Drag the `.crx` file onto the page. Chrome shows an "Install extension?" dialog.
4. Click **Add**.

Chrome may warn that the extension is not from the Web Store and is from an untrusted source. This is expected for self-distributed extensions.

**Load unpacked `.zip` (Developer mode):**
1. Download and unzip `browsergent-<version>.zip`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the unzipped folder.

### Updates (automatic)

Once installed, Chrome polls `update.xml` every few hours. When a new version appears:
- Downloaded from the release's `.crx` URL
- Installed automatically on browser restart
- No user action required

### Force a manual update check

`chrome://extensions` → **Update** button (visible in Developer mode).

## Local packaging for testing

```bash
# generate a throwaway key (NOT the production one)
openssl genrsa -out /tmp/dev-key.pem 2048

# build + package into release/
node scripts/package-crx.mjs --key /tmp/dev-key.pem
```

Output lands in `release/`. Use this to test the CRX format before tagging a real release.
