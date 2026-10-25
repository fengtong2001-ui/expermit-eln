// favicon.svg(64x64 viewBox)→ 512x512 PNG,electron-builder 自动转各尺寸 ico
import sharp from 'sharp'
await sharp('public/favicon.svg', { density: 576 }).resize(512, 512).png().toFile('build/icon.png')
console.log('build/icon.png written')
