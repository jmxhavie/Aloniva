# Aloniva Commercial Website (Static, Responsive, E‑commerce‑style)

This package contains a complete, mobile‑first storefront for **Aloniva Products Ltd** with:
- Dynamic product grid (search, filter, sort)
- Cart with **Checkout via WhatsApp**
- Product quick‑view modal
- Clean, fast, framework‑free stack (HTML/CSS/JS)

## Structure
```
nivera_commercial_site/
  index.html
  styles.css
  script.js
  data/
    products.js         <-- edit products & placeholder prices here
  assets/
    aloniva-logo.svg
    ph-*.svg            <-- placeholder images per line
```
## Edit in VS Code
1. Open this folder in VS Code.
2. Install the **Live Server** extension.
3. Right‑click `index.html` → **Open with Live Server**.
4. Update catalog in `data/products.js` (names, prices, sizes, image paths).
5. Change WhatsApp number in `script.js`: `const phone = "2567……";`
6. Customize colors in `styles.css` (CSS variables at the top).

## Launch (Free)
- **GitHub Pages**: push repo → Settings → Pages → Deploy from `main`, root `/`.
- **Netlify**: drag‑and‑drop folder into dashboard.
- **Vercel**: import project from GitHub → Framework “Other” → deploy.

## Manage
- Add products by appending items to `data/products.js`.
- Replace placeholder images in `assets/` with real product photos (1200×900).
- Cart persists in browser `localStorage`.

© Aloniva Products Ltd
