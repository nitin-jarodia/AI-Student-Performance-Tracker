# Screenshots

## TODO — replace SVG previews with real PNG captures

The README currently embeds SVG wireframe previews (`dashboard.svg`, `analytics.svg`, `students.svg`).  
**Replace them with real screenshots from the live demo** when you have a minute:

### Steps

1. Open https://ai-student-performance-tracker.vercel.app
2. Sign in with `demo@school.com` / `demo`
3. Set browser window to **1280×720** (or capture at that size)
4. Capture these three pages and save PNGs **in this folder**:

| Save as | Navigate to | What to show |
|---------|-------------|----------------|
| `dashboard.png` | `/dashboard` | Risk KPI cards + charts |
| `analytics.png` | `/analytics` | Class average + risk factor breakdown |
| `students.png` | `/students` | Student grid or table with risk badges |

5. In `README.md`, change image links from `.svg` to `.png`:

```markdown
![Dashboard](docs/screenshots/dashboard.png)
![Analytics](docs/screenshots/analytics.png)
![Students](docs/screenshots/students.png)
```

6. Optionally delete the `.svg` files once PNGs are in place.

**Windows shortcut:** `Win + Shift + S` → select region → save to this folder.

Until PNGs exist, the SVG previews keep README images from breaking.
