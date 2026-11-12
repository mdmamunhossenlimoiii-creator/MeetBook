# MySocial

Facebook-style social platform. HTML5 + CSS3 + ES6 modules, Firebase Auth + Cloud Firestore, hosted on GitHub Pages. 100% free tier, no build step.

Website UI text is English. Architecture, data model and free-tier limits: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Features

Accounts (email/password and Google) · profiles with photo, cover and bio · feed with photo and video-link posts · reactions, comments, share, save, report · friends (requests) and follow · private and group chat · 24-hour stories · short video feed (reels) · groups (public/private, join requests) · notifications · privacy settings · light / dark mode · admin panel (dashboard, users, staff roles, posts, reports, bots, announcements, maintenance mode, logs) · AI bots · responsive for Android, tablet, desktop.

## Setup (বাংলা)

1. **Firebase প্রজেক্ট**: <https://console.firebase.google.com> → Add project → Spark (free) plan রাখুন।
2. **Web app যোগ করুন**: Project settings → Your apps → `</>` → config কপি করে `js/firebase-config.js`-এ বসান।
3. **Authentication**: Build → Authentication → Sign-in method → *Email/Password* চালু করুন (চাইলে *Google*-ও)।
4. **Firestore**: Build → Firestore Database → Create database → Production mode। তারপর *Rules* ট্যাবে `firestore.rules`-এর পুরো লেখা পেস্ট করে **Publish** করুন।
5. **Indexes** (ফ্রি): দুইভাবে করা যায়।
   - Firebase CLI: `firebase deploy --only firestore:indexes` (`firestore.indexes.json` ব্যবহার হবে), অথবা
   - অ্যাপ চালানোর সময় কোনো পেজে index error এলে error-এর লিংকে ক্লিক করলে Firebase নিজেই index তৈরি করে দেয়।
6. **Authorized domain**: Authentication → Settings → Authorized domains → `mdmamunhossen69.github.io` যোগ করুন।
7. **GitHub Pages**: রিপোর Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`।
8. **প্রথম Super Admin বানানো**: ওয়েবসাইটে একটা অ্যাকাউন্ট খুলুন → Firebase Authentication → Users থেকে আপনার UID কপি করুন → Firestore-এ `admins` কালেকশন বানিয়ে ডকুমেন্ট ID = সেই UID, ফিল্ড `role` = `super_admin` (লেখা string) দিন। **`role` ঠিক `super_admin`, `admin` বা `moderator` হতে হবে।** `role` না থাকলে বা অন্য কিছু লেখা থাকলে ওই ডকুমেন্ট থেকে **কোনো ক্ষমতাই মেলে না** (rules ও অ্যাপ দুই জায়গাতেই)। আগের `enabled: true` ধরনের ডকুমেন্ট থাকলে তাতে `role` যোগ করুন, নইলে আপনি অ্যাডমিন পেজে ঢুকতে পারবেন না। এরপর বাকি স্টাফ Admin Panel → **Staff & roles** থেকে যোগ করা যায়। ফ্রন্টএন্ডে কোনো অ্যাডমিন পাসওয়ার্ড বা সিক্রেট নেই, আর rules অনুযায়ী কোনো সাধারণ ইউজার `/admins`-এ লিখতে পারে না।

## Admin Panel

খুলতে: লগইন → মেনু → **Admin dashboard** (`#/admin`)। তিনটা রোল:

| রোল | কী করতে পারে |
|---|---|
| Super Admin | সব কিছু: স্টাফ ও রোল, স্থায়ীভাবে অ্যাকাউন্ট ডিলিট (কিউ), server jobs |
| Admin | ইউজার (block, verified badge, edit), পোস্ট, রিপোর্ট, রিল/গ্রুপ, announcement, বট, global settings, logs |
| Moderator | রিপোর্ট, পোস্ট hide/restore/delete, রিল ডিলিট, অস্থায়ী suspension |

বিভাগ: Dashboard (সংখ্যা + দৈনিক/সাপ্তাহিক/মাসিক চার্ট) · Reports (ইউজার/পোস্ট/কমেন্ট/গ্রুপ/রিল, resolve/dismiss, history) · Users (নাম বা UID দিয়ে সার্চ, block, suspend, verify, activity) · Posts (hide/restore, কমেন্ট বন্ধ/চালু, delete; **approve/reject সিস্টেম নেই**) · Reels & Groups · AI Bots · Announcements · Global settings (maintenance, sign-up) · Activity logs · Staff & roles · Server jobs।

প্রতিটা স্টাফ অ্যাকশন `adminLogs`-এ লেখা হয়। rules অনুযায়ী লগ কেউ বদলাতে বা মুছতে পারে না।

**গুরুত্বপূর্ণ সীমা (সৎভাবে):**
* **Hidden পোস্ট** ও **maintenance mode** ওয়েবসাইটের ইন্টারফেসে প্রয়োগ হয়। Firestore rules কোয়েরি ফিল্টার করতে পারে না, তাই প্রযুক্তি জানা কেউ সরাসরি ডেটাবেস কোয়েরি করলে hidden পোস্ট দেখতে পারবে। সম্পূর্ণ আটকাতে হলে পোস্ট ডিলিট করুন।
* সাইন-আপ বন্ধ করাও শুধু সাইন-আপ ফর্মে। পুরোপুরি বন্ধ করতে Firebase Authentication সেটিংস ব্যবহার করুন।
* Marketplace ও Pages এই অ্যাপে আগে থেকেই নেই, তাই Admin Panel-এও নেই।
* অ্যাকাউন্ট ডিলিটের সময় ওই ইউজারের **অন্যের পোস্টে করা কমেন্ট** থেকে যায় (খুঁজতে আলাদা collection-group index লাগত)। এই অ্যাপ Cloud Storage ব্যবহার করে না, ছবি Firestore-এর ভেতরে থাকে।

## Server jobs (GitHub Actions, ফ্রি)

ব্রাউজারে Admin SDK key রাখা যায় না, তাই স্থায়ী ডিলিট ও ব্যাকআপ GitHub Actions-এ হয়। এক্ষেত্রে একটা Google **service account** লাগে। এটা ফ্রি (Blaze লাগে না)। key শুধু GitHub Secret-এ থাকে, রিপোতে বা ওয়েবসাইটে কখনো নয়।

1. Firebase console → Project settings → **Service accounts** → *Generate new private key* → JSON ফাইল নামান (**কাউকে দেবেন না, রিপোতে তুলবেন না**)।
2. GitHub রিপো → Settings → Secrets and variables → Actions → New repository secret:
   * `FIREBASE_SERVICE_ACCOUNT` = ওই JSON ফাইলের **পুরো লেখা**
   * `BACKUP_PASSPHRASE` = কমপক্ষে ১২ অক্ষরের একটা পাসওয়ার্ড (ব্যাকআপ এনক্রিপ্ট করার জন্য, হারালে ব্যাকআপ খোলা যাবে না)
3. ফাইল মুছে ফেলুন।

| Workflow | কী করে | কখন |
|---|---|---|
| `Account deletion queue` | Super Admin যে অ্যাকাউন্ট কিউ করেছে সেটার Auth user ও ডেটা মোছে | প্রতি ~৩০ মিনিটে |
| `Weekly encrypted backup` | সব কালেকশনের JSON ব্যাকআপ, **এনক্রিপ্ট করে** workflow artifact (৩০ দিন) | প্রতি রবিবার, বা হাতে চালিয়ে |

**Service account-এর ক্ষমতা কমান (সুপারিশ):** Firebase-এর ডিফল্ট `firebase-adminsdk` অ্যাকাউন্টের ক্ষমতা অনেক বেশি। Google Cloud console → IAM → Service Accounts-এ নতুন একটা অ্যাকাউন্ট বানিয়ে শুধু **Cloud Datastore User** (Firestore পড়া/লেখা/মোছা) আর **Firebase Authentication Admin** (Auth ইউজার মোছা) রোল দিন, তার key-ই Secret-এ রাখুন। সন্দেহ হলে key মুছে (Service accounts → Keys → Delete) Secret বদলে ফেলুন।

**Restore (হাতে, নিজের কম্পিউটারে; CI-তে নয়):** `BACKUP_PASSPHRASE=... FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" CONFIRM_PROJECT_ID=<project-id> node scripts/restore.mjs ফাইল.enc` — এটা **dry run** (কিছু লেখে না)। সত্যিই লিখতে শেষে `--apply` দিন। ডিফল্টে শুধু যে ডকুমেন্ট নেই সেগুলো তৈরি হয়, আছেগুলো বদলায় না (`--overwrite` দিলে বদলায়)। `admins` ও `deletionRequests` কখনো restore হয় না। **ব্যাকআপে Firebase Authentication অ্যাকাউন্ট (ইমেইল/পাসওয়ার্ড) নেই**, তাই মুছে ফেলা অ্যাকাউন্ট ফিরে আসবে না, আর ব্যাকআপে ছবি বাদ থাকে। আসল প্রজেক্টে চালানোর আগে আলাদা টেস্ট প্রজেক্টে একবার restore করে দেখুন।

ব্যাকআপ এনক্রিপ্ট না করলে পাবলিক রিপোর artifact যেকোনো GitHub ইউজার নামাতে পারত, তাই পাসওয়ার্ড ছাড়া job চলেই না। খুলতে: `BACKUP_PASSPHRASE=... node scripts/backup-decrypt.mjs ফাইল.enc out.json`। ব্যাকআপে বড় এম্বেডেড ছবি বাদ থাকে। GitHub scheduled job দেরিতে চলতে পারে, তাই ডিলিট "প্রায় সাথে সাথে" নয়।

### AI Bot accounts

* বট **Firebase Auth অ্যাকাউন্ট নয়**, শুধু Firestore প্রোফাইল (`users/bot_01` … `bot_30`)। লগইন বা পাসওয়ার্ড নেই। সব জায়গায় **"AI Bot"** ব্যাজ দেখায়, বায়োতে সবসময় লেখা থাকে এটা এআই বট।
* ২৩টা বিল্ট-ইন বট (৯টা personality: Friendly, Funny, Helpful, Tech, Sports, Photography, Travel, Gaming, News Discussion)। Admin → **AI Bots** থেকে নতুন বট তৈরি, এডিট (নাম, username, bio, personality, ভাষা, interests, avatar/cover), মুছে ফেলা, চালু/বন্ধ, Auto post / comment / reaction / chat সুইচ, দৈনিক লিমিট, প্রতি বটের activity log এবং সব বটের একসাথে ON/OFF করা যায়।
* **টেক্সট আসে তৈরি টেমপ্লেট থেকে** (বাংলা ও ইংরেজি), কোনো AI মডেল দিয়ে নয়। তাই কথোপকথন সহজ ও সীমিত, ভুলও হতে পারে। পোস্ট/মেসেজের **লেখা** (কীওয়ার্ড) দেখে বিষয় বোঝে। **ছবির ভেতরের জিনিস চেনে না**, শুধু ক্যাপশন পড়ে।
* ডুপ্লিকেট কমেন্ট আটকানো হয়। মৃত্যু, অসুস্থতা, কষ্টের মতো সংবেদনশীল পোস্টে বট চুপ থাকে। কেউ নিজের ক্ষতির কথা লিখলে বট জানায় সে এআই এবং আসল মানুষ বা হেল্পলাইনে যোগাযোগ করতে বলে।
* **সম্মতি ছাড়া এনগেজমেন্ট নেই:** বট শুধু সেই ইউজারের পোস্টে কমেন্ট/রিঅ্যাক্ট করে যিনি Settings → *AI bots on my posts* চালু করেছেন (ডিফল্ট বন্ধ)। প্রতি পোস্টে সর্বোচ্চ ১টা বট, ১টা কমেন্ট ও ১টা রিঅ্যাকশন। বটের রিঅ্যাকশন **"🤖 N AI"** নামে আলাদা দেখায়, মানুষের সংখ্যায় ধরা হয় না।
* **সম্মতির নিয়ম এখন `firestore.rules`-ও প্রয়োগ করে** (শুধু স্ক্রিপ্ট নয়): রানার বা অ্যাডমিন কেউই সম্মতি না দেওয়া ইউজারের পোস্টে বটের কমেন্ট/রিঅ্যাকশন লিখতে পারে না। অ্যাডমিন প্যানেলের "Comment as a bot" টুলেও একই নিয়ম।
* **Bot runner অ্যাকাউন্টের নিয়ম:** ওই Auth ইউজারের জন্য `users/{uid}` প্রোফাইল ডকুমেন্ট **বানাবেন না** (বানালে সে সাধারণ ইউজারের মতো লিখতে পারত)। rules অনুযায়ী সে শুধু বটের হয়ে পোস্ট/কমেন্ট/রিঅ্যাকশন/চ্যাট-উত্তর লিখতে পারে, আর **শুধু যেসব প্রাইভেট চ্যাটে একটা AI বট আছে** সেগুলো পড়তে পারে (উত্তর দিতে হলে পড়তে হয়, তাই ইউজারকে চ্যাটে "এটা AI বট" জানানো হয়)।
* **বট-টু-বট কমেন্ট ডিফল্টে বন্ধ** (ভুয়া জনপ্রিয়তার মতো দেখায়)। Global settings থেকে চালু করা যায়।
* বটের সাথে চ্যাট: ইউজার প্রোফাইল থেকে *Chat with AI*। উত্তর **তাৎক্ষণিক নয়**, প্রতি ~২০ মিনিটের scheduled job দেয় (GitHub দেরি করতে পারে)।

#### অটোমেটিক কাজ (GitHub Actions, ফ্রি)

* `AI bot activity` প্রতি ৬ ঘণ্টায়: নতুন পোস্ট + (সম্মতি দেওয়া ইউজারের পোস্টে) এনগেজমেন্ট।
* `AI bot chat replies` প্রতি ~২০ মিনিটে: বটকে পাঠানো মেসেজের উত্তর (নতুন মেসেজ না থাকলে সাথে সাথে বেরিয়ে যায়)।
* সব বটের কাজ `botLogs`-এ লেখা হয়। প্রতি বটের `dailyLimit` মানা হয়।

নিরাপত্তা: Admin SDK key বট-রানারে ব্যবহার হয় না। একটা আলাদা সাধারণ Auth অ্যাকাউন্ট ("bot runner") দিয়ে লগইন করে, আর Rules অনুযায়ী ওই অ্যাকাউন্ট শুধু বটের হয়ে কাজ করতে পারে (পাবলিক পোস্ট, ভিডিও কখনো নয়, কমেন্ট, বটের নিজের key-তে রিঅ্যাকশন, চ্যাট উত্তর)।

চালু করার ধাপ (একবারই):
1. `firestore.rules` Publish করুন (Firebase console এখানেই সিনট্যাক্স ভুল ধরিয়ে দেবে)।
2. Firebase → Authentication → Users → **Add user**: একটা নতুন ইমেইল ও লম্বা পাসওয়ার্ড। এই অ্যাকাউন্টের **UID** কপি করুন।
3. Firestore → `botRunners` কালেকশন → ডকুমেন্ট ID = ওই UID, ফিল্ড `enabled` = `true`।
4. Admin → AI Bots → **Create missing built-in bots** (একবার)।
5. GitHub Secrets: `BOT_RUNNER_EMAIL`, `BOT_RUNNER_PASSWORD`।
6. Actions ট্যাব → *AI bot activity* → **Run workflow** দিয়ে একবার হাতে চালান।
7. Firestore-এ নতুন index লাগবে (প্রতি বটের activity log): প্রথমবার *Activity* বাটনে চাপলে error-এর লিংক থেকে এক ক্লিকে তৈরি হয়, বা `firebase deploy --only firestore:indexes`।

বন্ধ করতে: Admin → AI Bots → *Turn all bots OFF*, বা Secret মুছুন, বা Actions-এ workflow *Disable* করুন। GitHub পাবলিক রিপোতে ৬০ দিন কোনো কমিট না হলে scheduled workflow নিজে বন্ধ করে দেয়, তখন Actions ট্যাব থেকে আবার Enable করতে হয়।

### Optional

* **App Check** (বট/অপব্যবহার ঠেকাতে): Firebase console → App Check → reCAPTCHA v3 দিয়ে web app রেজিস্টার করুন, site key `js/firebase-config.js`-এর `appCheckSiteKey`-এ দিন, তারপর Firestore-এর জন্য enforcement চালু করুন। শুধু চালু করলেই হবে না, enforcement না দিলে এটা কিছু আটকায় না।
* **ভিডিও আপলোড**: ফ্রি Cloudinary অ্যাকাউন্টে একটা *unsigned* upload preset বানিয়ে `cloudName` ও `uploadPreset` দিন। না দিলে ভিডিও শুধু লিংক (YouTube / সরাসরি `.mp4`) হিসেবে দেওয়া যাবে।

## Local run

ES modules `file://` দিয়ে চলে না, তাই একটা লোকাল সার্ভার লাগবে:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(`localhost` Firebase Authorized domains-এ আগে থেকেই থাকে।)

## Design decisions you should know

* **ছবি Firestore-এ**, Storage-এ নয়: ব্রাউজারে ছোট করে (JPEG) ডকুমেন্টের ভেতরে রাখা হয় যাতে Blaze plan না লাগে। **ভিডিও কখনো Firestore-এ রাখা হয় না।**
* **Friends-only পোস্ট/স্টোরি** পোস্ট করার সময়ের বন্ধুদের তালিকা (`audience`) দিয়ে আটকানো হয়। পরে যে বন্ধু হয়েছে সে পুরনো friends-only পোস্ট দেখবে না।
* **Profile privacy ও "কে মেসেজ করতে পারবে"** শুধু UI-তে প্রয়োগ হয়। ডেটাবেস rules-এ প্রয়োগ হয় পোস্ট ও স্টোরির audience।
* Cloud Functions ব্যবহার হয়নি (paid), তাই counter ও notification ক্লায়েন্ট থেকে লেখা হয়।
* Search শুধু নামের শুরু দিয়ে (prefix)।

## Testing status (honest)

চালানো যায় (আপনার কম্পিউটারে বা GitHub Actions-এ):

```bash
npm test                  # rules ইন্টারপ্রেটার + Permission Matrix + mutation টেস্ট + স্ক্রিপ্ট/edge-case টেস্ট + import চেক (নকল Firestore, কোনো নেটওয়ার্ক লাগে না)
npm run test:browser      # হেডলেস Chromium-এ Admin Panel (playwright লাগে)
npm run test:emulator     # আসল Firebase Firestore Emulator-এ একই Permission Matrix (Java 21 + নেটওয়ার্ক লাগে; production-এ কিছু ছোঁয় না)
node tests/rules-matrix/generate-doc.mjs   # docs/PERMISSIONS.md নতুন করে বানায় (টেস্ট ফেল করে যদি ফাইল পুরনো হয়)
```

Permission Matrix (কে কী পারে): [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md)। CI (`.github/workflows/tests.yml`) তিনটা জব চালায়: `unit`, `browser`, `rules-emulator`। কোনো Secret লাগে না। Settings → Branches → main-এর branch protection-এ তিনটা জবই "Required" করে দিন।

**এই সেশনে সত্যিই চালানো হয়েছে:** নিজস্ব rules ইন্টারপ্রেটারে 12 actor × সব capability (rules-এর আসল লেখা দিয়ে), 31টা ইচ্ছাকৃত নিরাপত্তা-বাগ ঢুকিয়ে (mutation) দেখা হয়েছে টেস্ট ধরে কি না, rules-সহ নকল Firestore-এ বট-রানার (সম্মতি), ডিলিট/ব্যাকআপ/restore-এর edge case, হেডলেস Chromium-এ Admin Panel।

**এখনো আসল Firebase-এ চালানো হয়নি:** আসল Firebase Emulator-এর রান (শুধু GitHub Actions-এর `rules-emulator` জবে হবে; এখানে নেটওয়ার্ক বন্ধ), আসল Firebase প্রজেক্টে rules Publish, আসল Auth, Firestore index, আসল service-account দিয়ে ডিলিট/ব্যাকআপ/restore, আসল GitHub Actions রান। **merge বা Publish-এর আগে `rules-emulator` জব সবুজ কি না দেখুন।** সবুজ না হলে ওই ফেলিওর আসল Google ইঞ্জিনের মত, সেটা আমাকে পাঠান।

## পরবর্তী ফিচার পরিকল্পনা

Stories & Highlights · Advanced Messenger · Trending & Hashtags · Two-Factor Authentication · Saved Posts (আংশিক আছে) · বাংলা ও ইংরেজি ইন্টারফেস · Creator Dashboard · Marketplace · Polls & Quiz · Post Insights · Privacy Center · Login & Device History। এগুলো এখনো বানানো হয়নি।
