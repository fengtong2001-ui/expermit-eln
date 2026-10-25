import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { applyTheme } from './lib/theme'

applyTheme()
// 原生壳（app:// 协议）里 WKWebView 不支持 Service Worker，跳过注册；网页端照常
if (import.meta.env.PROD && !location.protocol.startsWith('app')) registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
