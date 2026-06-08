# Guide: Get `STRIPE_PREMIUM_PRICE_ID` and `STRIPE_WEBHOOK_SECRET`

Both values live in your Stripe account. Sign in at [dashboard.stripe.com](https://dashboard.stripe.com) before starting. Use **Test mode** while developing (toggle in the top right).

---

## 1. `STRIPE_PREMIUM_PRICE_ID` (a recurring $20/month price)

A "Price" is the actual amount you charge. Each price has an ID starting with `price_…`. Create one and copy its ID.

**Step 1 — Create the Product**
1. In the Stripe Dashboard sidebar click **Product catalog** → **Products** → **+ Add product**.
2. Choose **Recurring** (a subscription, not a one-time payment).
3. Fill in:
   - **Name**: `Premium Plan` (or whatever you like — internal only)
   - **Description**: optional
4. Under **Pricing**, fill in:
   - **Price**: `20.00`
   - **Currency**: `USD`
   - **Billing period**: `Monthly`
5. Click **Save product**.

**Step 2 — Copy the Price ID**
1. On the saved product page you'll see a **Pricing** section.
2. Click the price row (the `20.00 USD / month` entry) — it expands to show the API ID.
3. Click **Copy ID** next to `price_…` (it'll look like `price_1Nxxxxxxxxxxxxxxxxxxxxx`).

**Step 3 — Paste it into `.env.local`**
```env
STRIPE_PREMIUM_PRICE_ID=price_1Nxxxxxxxxxxxxxxxxxxxxx
```

> Tip: if you ever change the price, create a **new** Price (don't edit the old one — Stripe keeps old prices for existing subscribers). Update the env var to the new `price_…` ID.

---

## 2. `STRIPE_WEBHOOK_SECRET` (signing secret for `/api/webhooks/stripe`)

This secret lets Stripe prove that webhook events are genuine. There are two values: one for local dev, one for production.

### Local development (use `stripe listen`)

The Stripe CLI runs a local listener that forwards real Stripe events to your dev server and signs them with its own secret.

**Step 1 — Install the Stripe CLI**

Windows (PowerShell):
```powershell
scoop install stripe
```

Or download from [https://stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli).

**Step 2 — Log in**
```bash
stripe login
```
This opens a browser tab to authorize the CLI. Use your Stripe account that's in test mode.

**Step 3 — Start the listener**

In a second terminal (keep `npm run dev` running in the first), run:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

On first run it prints a "ready" line that includes a `whsec_…` value, e.g.:
```
> Ready! Your webhook signing secret is whsec_1234567890abcdefghijklmnopqrstuvwxyz (^C to quit)
```

**Step 4 — Copy the `whsec_…` value into `.env.local`**
```env
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefghijklmnopqrstuvwxyz
```

**Step 5 — Restart `npm run dev`** so Next.js loads the new env var.

> The secret from `stripe listen` is **only valid for that running session**. If you stop the listener, you can copy the secret again from its output, or run `stripe listen --print-secret` separately. The secret it prints is tied to your Stripe account and stays the same across runs of the CLI on the same machine.

### Test the webhook end-to-end

With both `npm run dev` and `stripe listen` running, trigger a fake event:
```bash
stripe trigger checkout.session.completed
```

You should see a `[stripe webhook]` log in the dev server, and your terminal running `stripe listen` will show the event as `200 OK`.

To do a full real test, complete a test card checkout (use card number `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP) — your `/account/billing` page should reload and show the Premium plan.

### Production (Vercel / your live domain)

1. Deploy your app and confirm `https://your-domain.com/api/webhooks/stripe` is reachable.
2. Stripe Dashboard → **Developers** → **Webhooks** → **+ Add endpoint**.
3. **Endpoint URL**: `https://your-domain.com/api/webhooks/stripe`
4. **Description**: `Production billing webhook` (optional).
5. Under **Listen for**, select at least:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Click **Add endpoint**.
7. On the endpoint detail page, click **Reveal** under **Signing secret** and copy the `whsec_…` value.
8. Add it to your production env (Vercel project settings → Environment Variables):
   ```
   STRIPE_WEBHOOK_SECRET=whsec_…
   STRIPE_SECRET_KEY=sk_live_…
   STRIPE_PREMIUM_PRICE_ID=price_…   # from a new live-mode price you create the same way as above
   ```
9. Redeploy so the new env vars take effect.

---

## Quick checklist

| Variable | Where to get it | Format |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → **Secret key** (test or live) | `sk_test_…` / `sk_live_…` |
| `STRIPE_PREMIUM_PRICE_ID` | Dashboard → Product catalog → your product → price row → API ID | `price_…` |
| `STRIPE_WEBHOOK_SECRET` | `stripe listen` output (dev) **or** Dashboard → Webhooks → your endpoint → Signing secret (prod) | `whsec_…` |
| `NEXT_PUBLIC_APP_URL` | Already set to `http://localhost:3000` for dev; set to your real domain in prod | URL |

After updating `.env.local`, **stop and restart `npm run dev`** — Next.js only reads env files at startup.