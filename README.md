# Private Tracker (PWA)
A logging-only tracker for peptide entries and body weight. No medical advice, doses, schedules or reminders. All data stays in your browser's IndexedDB; nothing is sent anywhere.

## Structure
index.html · styles.css · app.js · db.js · manifest.json · service-worker.js · icons/ · vendor/chart.umd.js (you add this, see below)

## Windows setup
1. Install Node.js (nodejs.org) and Git.
2. In the project folder run: `npm install chart.js` then copy `node_modules\chart.js\dist\chart.umd.js` to `vendor\chart.umd.js` (PowerShell: `Copy-Item node_modules\chart.js\dist\chart.umd.js vendor\chart.umd.js`). Do not commit node_modules.
3. Serve locally: `npx serve .` (or `py -m http.server 8080`) and open http://localhost:3000 (or :8080). localhost counts as secure, so the service worker works.

## GitHub Pages
1. Create a public repo, e.g. `tracker`. The site source is public: never commit personal data, backups or secrets. Your records live only on your phone.
2. `git init`, `git add .`, `git commit -m "init"`, `git branch -M main`, `git remote add origin <repo-url>`, `git push -u origin main`.
3. Repo → Settings → Pages → Deploy from branch → `main` / root → Save.
4. Open `https://<user>.github.io/tracker/` (HTTPS).
5. To ship updates, change `CACHE` in service-worker.js (e.g. tracker-v2) and push.

## Install on iPhone
Safari → open the URL → Share → Add to Home Screen → Add. Note: the Home Screen app and Safari have separate storage on iOS, so choose one and use it consistently; export a backup before switching.

## Data and limits
Data can be lost if website data is cleared or the device is lost; it is not synced. Backup files are unencrypted and private. No notifications are implemented: iOS offers ordinary websites no reliable background execution.

## Testing checklist
- [ ] Add peptide, log entry, weight; reload and restart browser: data persists
- [ ] Edit and delete (with confirmation) logs and weights; charts and dashboard update
- [ ] Filters by peptide and date range; weight ranges 7d/30d/90d/1y/all
- [ ] Two weights on one day both appear; kg/lb switch changes display only
- [ ] Export, delete all, import: data restored; a bad JSON file is rejected without changes
- [ ] Offline: load once online, enable airplane mode, reopen: app works
- [ ] iPhone: safe areas, bottom bar, dialogs and keyboard layout are usable
