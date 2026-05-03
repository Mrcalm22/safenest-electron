// Generate macOS .icns and Windows .ico from SVG
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const svgPath = path.join(__dirname, '../assets/icon.svg')
const assetsDir = path.join(__dirname, '../assets')

async function generate() {
  // 1. Generate 1024x1024 base PNG
  const basePng = await sharp(svgPath)
    .resize(1024, 1024)
    .png()
    .toBuffer()

  // 2. Generate macOS .icns
  const iconsetDir = path.join(assetsDir, 'icon.iconset')
  fs.mkdirSync(iconsetDir, { recursive: true })

  const sizes = [
    { size: 16, name: 'icon_16x16' },
    { size: 32, name: 'icon_16x16@2x' },
    { size: 32, name: 'icon_32x32' },
    { size: 64, name: 'icon_32x32@2x' },
    { size: 128, name: 'icon_128x128' },
    { size: 256, name: 'icon_128x128@2x' },
    { size: 256, name: 'icon_256x256' },
    { size: 512, name: 'icon_256x256@2x' },
    { size: 512, name: 'icon_512x512' },
    { size: 1024, name: 'icon_512x512@2x' },
  ]

  for (const { size, name } of sizes) {
    await sharp(basePng)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetDir, `${name}.png`))
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(assetsDir, 'icon.icns')}"`)
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  console.log('Generated: assets/icon.icns')

  // 3. Generate Windows .ico (multi-size)
  const { default: pngToIco } = require('png-to-ico')
  const tempDir = path.join(assetsDir, '.temp-ico')
  fs.mkdirSync(tempDir, { recursive: true })
  const icoSizes = [16, 32, 48, 256]
  const icoPaths = []
  for (const size of icoSizes) {
    const p = path.join(tempDir, `${size}.png`)
    await sharp(basePng).resize(size, size).png().toFile(p)
    icoPaths.push(p)
  }
  const icoBuf = await pngToIco(icoPaths)
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuf)
  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('Generated: assets/icon.ico (16,32,48,256)')

  // 4. Generate 1024x1024 PNG for Linux/general use
  await sharp(basePng)
    .toFile(path.join(assetsDir, 'icon.png'))
  console.log('Generated: assets/icon.png (1024x1024)')

  console.log('\nAll icons generated successfully!')
}

generate().catch(err => {
  console.error(err)
  process.exit(1)
})
