# Validation runtime regression fixture

This small application verifies the generator's isolated test runner against actual HTTP requests, SQLAlchemy persistence, and a browser. It is a test fixture, not a generated QuickCart release or a production authentication template. Identity uses mock-only headers and refuses to start without `PAYMENT_PROVIDER=mock`.

The seven backend cases check unauthenticated rejection, required input and inventory validation, persistent cart mutations, ownership isolation, invalid/expired coupons, complete rollback after a checkout failure, and consistent checkout totals/history/retries. The browser case adds a cart item and confirms persistence after reloading the page.

Run through `npm run test:runtime -- <python-with-fixture-dependencies> <directory-containing-playwright-node_modules>`. Install the Python dependencies from `backend/requirements.txt` into a disposable virtual environment. The dedicated runner uses `@playwright/test` 1.51.1 and an installed Google Chrome. It creates its own temporary workspace and SQLite database, then removes them. IDE generated-project validation uses its separately installed Chromium.

Results are saved under `docs/08-quickcart-study/verification/`. The fixture validates the harness and reference workflows; it does not certify the archived QuickCart applications or replace a fresh model generation.
