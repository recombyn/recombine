/// <reference types="vite/client" />

declare const __APP_URL__: string

declare module '*.md?raw' {
  const content: string
  export default content
}
