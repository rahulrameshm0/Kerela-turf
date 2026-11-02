# TurfKerala

Kerala turf discovery, Firebase sign-in, slot holds, Razorpay checkout, cancellations and rescheduling, with an administrator area for venues, photos, availability, customers, payments and refunds. Inventory lives in Firestore; photos live in Firebase Storage. No sample venues are added to the live project.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
# For a new checkout only: copy .env.example to .env and fill its values.
npm run doctor
npm run dev
```

Open http://localhost:3001. `npm run dev` builds the browser bundle and starts the server; restart it after edits. `npm start` runs the existing build. Keep `APP_ORIGIN` aligned with the exact browser origin when changing the port or hostname.

`npm run doctor` reports missing local configuration without printing secrets or contacting external services. It exits with code 1 while required setup items remain. Passing this check does not prove Firebase permissions or payment connectivity.

## Connect the existing Firebase project

The local `.env` contains the supplied browser configuration for `keralaturf-678de`. The browser values enable SDK initialization; the server separately uses Application Default Credentials.

1. Configure server credentials using the [Firebase Admin setup guide](https://firebase.google.com/docs/admin/setup). For local use, set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of a credentials file stored outside this project. Hosted deployments can use an attached service identity.
2. Enable the intended Authentication providers (email/password and Google), and authorize the app’s domain, including localhost for development. Phone sign-in is optional and defaults off.
3. Create the Firestore database and Storage bucket matching the configured project. Give the server identity the permissions it needs for Authentication, Firestore and Storage.
4. Deploy the included Firestore and Storage rules using the Firebase CLI, explicitly targeting the intended project. Client database and storage access is denied; all application data access goes through the authenticated server API.
5. Create the owner’s account through the app. Copy its UID from Firebase Authentication into `ADMIN_UIDS` in `.env`, then restart the server. Open `/admin` to add real turf details, upload photos and publish slots.

The Firebase configuration file currently defines rules and emulators, not web hosting. The Node API must run alongside the built frontend; deploying only `dist/` will not provide booking functionality.

## Grounds map

`/grounds` shows real football venues across Kerala from OpenStreetMap, with a Kerala district map, search and directions links. These listings are for discovery only: they are bundled from `src/data/grounds.json`, are never written to Firestore and cannot be booked. Each card shows a photograph of the venue's district from Wikimedia Commons, not of the venue itself; credits are in `public/media/CREDITS.md`.

Refresh the data with `node scripts/fetch-grounds.mjs` (venues; reuses saved town names and geocodes new venues at one request per second) and `node scripts/fetch-map.mjs` (district outlines), then rebuild. Keep the OpenStreetMap attribution visible wherever this data appears.

## Add turf photographs

Open **Admin → Turfs → Add a turf** or edit an existing turf. In **Turf photographs**, select one or more JPG, PNG or WebP images (up to 5 MB each). New turf photos are previewed before saving; existing turf uploads start immediately. Failed uploads remain available to retry without repeating successful uploads.

The first uploaded image becomes the search cover. Select **Use as cover** on another photo to change it. The selected cover appears on customer search cards and first in the turf detail gallery; all uploaded photos appear in the gallery. Removing the cover selects another remaining photo automatically. A new turf stays in draft if its initial photo upload fails. New turfs default to **Active** and **Show on the public page**, so saving adds them to discovery even before slots exist. Uncheck publication to keep a draft. Existing drafts remain private until you enable **Show on the public page** and save. Publish slots separately to offer booking availability. The public listing refreshes every 30 seconds while visible and when visitors return to the tab, keeping search filters intact.

Images are stored in Firebase Storage and served through the API. Draft and inactive turf photos require administrator authentication. No example venues or photographs are inserted into production by the tests.

### Block dates and publish availability

In the turf editor, select a date and choose **Block date**. A date block is saved even when no slots exist yet; later bulk publication skips that day. Existing bookings and unexpired holds prevent a date from being blocked. Unblock the date before opening individual slots or publishing new ones. The availability editor displays blocked dates, and the publication result includes blocked, existing and past slots in its skipped count.

Refunds for a cheaper reschedule and a later cancellation are retained as separate records, including their provider references. Neither operation overwrites the earlier refund history.

### Missing default credentials locally

If startup reports `Could not load the default credentials`, the browser configuration is present but the server has no usable Admin credentials. In Firebase Console, open **Project settings → Service accounts → Firebase Admin SDK → Generate new private key**. Store the downloaded JSON outside this repository, then set its actual absolute path in `.env`, for example:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/Users/rahul/.config/turfkerala/service-account.json
```

Keep this file private and out of source control. Run `npm run doctor`, then restart with `npm run dev`. Startup checks that Admin credentials can obtain an access token before opening the HTTP listener; database and storage permissions still need to be configured separately.

## Payments and scheduled recovery

Set the three `RAZORPAY_*` variables in `.env` with test-mode credentials first. Configure the provider webhook to reach `POST /api/webhooks/razorpay`, using the same webhook secret. The implemented event handlers accept `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` and `refund.failed`.

Set a random `JOBS_SECRET` and configure a scheduler to call `POST /api/jobs/reconcile` regularly (for example, every minute) with `Authorization: Bearer <JOBS_SECRET>`. The admin Payments page also provides a reconciliation button. Recovery clears expired holds, checks payment state and revisits outstanding refunds. Uncertain refund requests are reconciled without automatically submitting another refund.

Set `GOOGLE_MAPS_API_KEY` to enable locality search; district and turf-name search work without it. Set the real contact, legal business name and refund policy before opening bookings. `LAUNCH_MODE=public` validates the required launch configuration. Live Razorpay keys also require `ALLOW_LIVE_PAYMENTS=true`.

## Verify

```sh
npm run check
```

This runs syntax checks, API and booking workflow tests, then builds `dist/`. Tests use an isolated in-memory store and fake payment gateway; they do not charge money or write to the live Firebase project. The Firestore contention test runs only when `FIRESTORE_EMULATOR_HOST` is set and otherwise reports a skip.

Before launch, verify actual sign-in, owner access, venue/photo creation, competing slot claims, test checkout, webhook delivery, cancellation and rescheduling against the configured services. SMS/email booking notifications are not implemented. Firebase and Razorpay account setup, real inventory, hosting and live-service verification remain deployment work.

`LAUNCH_MODE=private` is a configuration flag, not an access-control boundary. Keep the initial deployment behind the hosting provider’s private-access protection until launch checks are complete. Do not expose it publicly based on that flag alone.
