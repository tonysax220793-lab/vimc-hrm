import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Cấu hình PWA: cài lên màn hình chính, cache vỏ app cho offline cơ bản.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg', 'favicon.ico',
        'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
        'assets/vimc-logo.svg', 'assets/vimc-emblem.svg', 'assets/dongson-watermark.svg'
      ],
      manifest: {
        name: 'VIMC People — Quản lý Nhân sự',
        short_name: 'VIMC People',
        description: 'Ứng dụng quản lý nhân sự nội bộ VIMC: chấm công ảnh, chat, checklist, bàn giao.',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1F7A4D',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
