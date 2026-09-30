# FLIGALIGA — The Vault (V3 polished)

A dark antique-curiosity ecommerce storefront built around the FLIGALIGA Vault concept.

## V3 polish
- Dedicated shareable product pages at `/product/<slug>-<id>`
- Consistent cinematic artifact imagery for common treasure types
- Stronger ivory/gold typography and improved contrast
- Cinzel Decorative branding for the FLIGALIGA wordmark
- Functional pages for Treasures, New Arrivals, The Ledger, About the Merchant, FAQ, Contact, Shipping, Returns and Privacy
- Footer and service-strip links now navigate to real pages
- `THE VAULT` returns to the homepage; `ENTER THE VAULT` opens the treasure catalogue
- Search opens the Treasures page with a query
- Responsive product catalogue and information pages

## Before launch
Replace placeholder business/contact/shipping/return/privacy text with the real company information and policies. Dutch online shops have information obligations around business identity, contact details, prices, delivery, returns and privacy; check the final site against current Dutch/EU requirements.

## Run
Copy your real `.env` file into the project root, then:

```bash
npm install
node server.js
```

Open `http://localhost:3000`.
