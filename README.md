# Memory Match

A browser-based vocabulary matching game. Your vocabulary library will be stored locally in your browser.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To verify a production build, run `npm run build` and then `npm run preview`.

## Deploy to GitHub Pages

1. Push the project to the `main` branch of a GitHub repository.
2. In the repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
3. The workflow builds and publishes the site on each push to `main`. Check the **Actions** tab for its status.
4. When deployment completes, open the URL shown in the `github-pages` environment or in **Settings → Pages**.