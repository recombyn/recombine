# API

Base URL: `http://localhost:8000/api/v1`

## Health

`GET /health` → `{ "status": "ok" }`

## Import

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/import/pdf` | 上传 PDF |
| POST | `/import/docx` | 上传 DOCX |
| POST | `/import/image` | 上传图片 |

### 响应

```json
{
  "job_id": null,
  "status": "done",
  "document": { "width": 794, "height": 1123, "deltaSetLike": {} },
  "meta": {
    "source_type": "pdf",
    "page_count": 1,
    "warnings": []
  }
}
```

Swagger UI: http://localhost:8000/docs
