# Desktop API sidecar

Local desktop builds embed FastAPI here after:

```bash
npm run build:desktop:sidecar
```

Output: `recombyn-api/recombyn-api.exe` (+ `_internal/` onedir).  
`npm run build:desktop` runs that step automatically when this folder is missing.
