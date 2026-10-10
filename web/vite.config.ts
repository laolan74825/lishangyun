import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 兼容旧设备浏览器（如老款平板内置 WebView）：默认 baseline 目标过新，
  // 旧内核遇到新语法会直接白屏（JS 执行失败，无任何请求发出）
  build: {
    target: 'es2018',
  },
  plugins: [
    react({
      compiler: true,
    }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '礼尚云',
        short_name: '礼尚云',
        description: '人情往来小账本——随手记下每一份心意',
        lang: 'zh-CN',
        theme_color: '#E07B3A',
        background_color: '#F5F5F0',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}']
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/ws': {
        target: 'http://127.0.0.1:8001',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {})
        },
      },
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
})
