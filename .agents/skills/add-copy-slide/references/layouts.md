# Copy slide layouts

Every slide has `id`, `title`, `notes` and `minutes`. Any layout also takes `eyebrow`, `citations`, `description`, `background` and `field` (`light`, `dark` or `accent`).

| Layout | Use it for | Fields |
|---|---|---|
| `content` | A point with a few items | `body`, `items`, `image` |
| `title` | The opening slide | `lines`, `eyebrow` |
| `closing` | The last slide, with a QR code | `url`, `linkLabel`, `caption` |
| `grid` | Cards with an icon, number or image | `cards`, `variant`, `tone`, `align`, `display`, `lede`, `cardsEyebrow` |
| `statement` | One big idea | `lines` |
| `section` | A divider between parts | `label`, `body`, `legend` |
| `quotes` | People's words | `quotes` |
| `people` | Who is involved | `people` |
| `image` | One picture, full bleed | `image` with `placement: "full-bleed"`, `body` |
| `stat` | A few numbers | `stats` |
| `comparison` | Two options side by side | `items` |
| `table` | Rows and columns | `tableColumns`, `tableRows` |
| `timeline` | Dated events | `items`, with `hollow: true` for an unconfirmed date |
| `chart` | A dot or bar chart | `chart` |

## Field shapes

```ts
items: [{ label: "Name", detail: "One line.", icon: "presentation" }]
image: { src: "/images/two.svg", alt: "What it shows", placement: "right-half" }
cards: [{ icon: "play", title: "Card", body: "One line." }]
quotes: [{ text: "Their words.", cite: "Their name" }]
people: [{ name: "A Person", role: "Their role", initials: "AP" }]
stats: [{ value: "42", label: "What it counts", source: "Where it came from" }]
tableColumns: ["Option", "Cost"]
tableRows: [{ cells: ["First", "Low"] }]
chart: { kind: "dot", xLabel: "x", yLabel: "y", points: [{ label: "One", x: 1, y: 2 }] }
```

- `placement` is `right-half`, `full-bleed` or `background`.
- `icon` is a Lucide icon name in kebab case, such as `square-terminal`.
- `src` starts at `public/`, so `public/images/a.svg` is `/images/a.svg`.
- A number or a claim that came from somewhere gets a `citations` entry: `{ text, url }`.

`live-ish schema` writes `.live-ish/schema/slide.json`, the full shape as JSON Schema.
