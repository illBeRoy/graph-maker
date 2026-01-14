# GraphMaker

<p align="center">
  <img src="public/og-image.png" alt="GraphMaker Preview" width="600" />
</p>

An LLM-friendly tool for visualizing and editing flowcharts and tree diagrams.

This app was 100% vibe coded with opus 4.5 in under an hour.

<p align="center">
<a href="https://graph-maker.site"><img src="btn_csv.png" width="200"></a>
</p>

<p align="center">
<a href="https://gemini.google.com/gem/1iacXBByzAxhWjs-bIMprxGnhOYCBBM-a"><img src="btn_gemini.png" width="200"></a>
</p>

## Why

Imagine that you drew a graph during a meeting. It looks cool. You want to work with it.

Graph Maker exposes a simple to understand API that makes it easy for LLMs to distill the information from your photo\graph (pun intended).

<img width="1312" height="1012" alt="image" src="https://github.com/user-attachments/assets/805f3157-f792-4286-aa57-c999c5edcfde" />

<img width="1312" height="1012" alt="image" src="https://github.com/user-attachments/assets/bcd64624-23e3-47cf-b613-da614958cc4c" />


## Features

- **Create with Gemini** — Lets Google Gemini build the graph data for you
- **Create from Table** — Opens a table editor that lets you manually input the data
- **Save \ Load CSV** — Loads and saves existing graph data as CSV tables
- **Visual Editor** — Drag nodes to reposition, with smart snapping
- **Export** — Export graph as PNG

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

## Local Development

```bash
bun install
bun dev
```

## License

MIT
