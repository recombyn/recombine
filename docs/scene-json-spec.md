# Scene JSON 规范

与 Web 编辑器运行时文档及 `packages/scene-schema` 保持一致。

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
        "ORIGIN_DATA": "示例文本",
        "DATA": { "chars": [] }
      }
    }
  }
}
```

完整 Schema 见 `packages/scene-schema/schema/scene-document.schema.json`。
