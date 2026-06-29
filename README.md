# Safety Documentation Center — Official v1

Shackelford-branded field safety document creator. The JSA module is the active working on-site app.

## Run locally

```bash
npm install
npm run dev -- --port 5196
```

Open `http://localhost:5196/`.

## Production build

```bash
npm run build
```

The production files are generated in `dist/`.

## GitHub Pages

This project includes `.github/workflows/deploy-pages.yml`. After the files are pushed to the repository's `main` branch, enable **GitHub Actions** as the Pages source in the repository settings. The workflow builds and publishes the `dist` folder automatically.

## Print settings

- Destination: Save to PDF or office printer
- Paper size: Letter
- Margins: Default
- Scale: 100%
- Headers and footers: Off
- Background graphics: On for the branded header
