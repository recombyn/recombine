# Scene JSON spec

Aligned with the Web editor runtime docs and `packages/scene-schema`.

```json
{
  "width": 794,
  "height": 1123,
  "deltaSetLike": {
    "ROOT": { "key": "root", "children": ["nodeId1"] },
    "nodeId1": {
      "key": "text",
      "x": 80,
      "y": 80,
      "width": 240,
      "height": 24,
      "attrs": {
        "ORIGIN_DATA": "Sample text",
        "DATA": { "chars": [] }
      }
    }
  }
}
```

Full schema: `packages/scene-schema/schema/scene-document.schema.json`.
