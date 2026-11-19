# Marketing Kit

- `StackAutopsy-Marketing-Kit.pdf` — the complete package (creatives, articles, playbook)
- `screenshots/` — raw product screenshots (1440×900 @2x)
- `edited/` — ad creatives (1600×1000)
- `kit.html` — print source of the PDF
- `tools/` — regeneration scripts

## Regenerating

```bash
npm i -D playwright-core @sparticuz/chromium   # not part of the product deps
# extract chromium libs once (see tools/shoot.mjs header) then:
npm run build && (cd dist && python3 -m http.server 8901) &
node marketing/tools/shoot.mjs
node marketing/tools/edited.mjs
node marketing/tools/pdf.mjs
```
