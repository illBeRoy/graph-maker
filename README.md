# GraphMaker

<p align="center">
  <img src="public/og-image.png" alt="GraphMaker Preview" width="600" />
</p>

A visual tool for creating and editing flowcharts from CSV files.

This app was 100% vibe coded with opus 4.5 in under an hour.

[![get started with csv](./btn_csv.png)](https://graph-maker.site)

[![get started with gemini](./btn_gemini.png)](https://gemini.google.com/gem/1iacXBByzAxhWjs-bIMprxGnhOYCBBM-a)

## Why

You first ask your LLM to generate a tree chart (from an image, instructions, or any other source) as a CSV (see [format](#csv-format)).
Then, simply import the CSV into the app to instantly visualize it as a beautiful diagram.

## Features

- **Create New** — Build graphs from scratch using the built-in table editor
- **CSV Import** — Drag & drop or upload CSV files to visualize graphs
- **Visual Editor** — Drag nodes to reposition, with smart snapping
- **Export** — Save as CSV or export as PNG

## CSV Format

```csv
0,Root,1;2
1,Foo,3
2,Bar,3
3,Buzz,
```

| Column     | Description                          |
| ---------- | ------------------------------------ |
| `id`       | Unique node identifier               |
| `label`    | Display text                         |
| `children` | Child node IDs (semicolon-separated) |

## Getting Started

```bash
bun install
bun dev
```

## License

MIT
