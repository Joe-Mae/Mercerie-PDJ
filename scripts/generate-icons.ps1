# Génère les icônes PWA à partir du logo de la boutique.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'apps/web/public/brand/logo-pdj.jpeg'
$outDir = Join-Path $root 'apps/web/public/icons'
$background = [System.Drawing.ColorTranslator]::FromHtml('#FCF5EB')

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Icon([int]$Size, [string]$Name, [double]$Scale) {
  $canvas = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear($background)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  $image = [System.Drawing.Image]::FromFile($source)
  try {
    $side = [int]($Size * $Scale)
    $offset = [int](($Size - $side) / 2)
    $graphics.DrawImage($image, $offset, $offset, $side, $side)
    $canvas.Save((Join-Path $outDir $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $image.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

New-Icon 192 'icon-192.png' 1.0
New-Icon 512 'icon-512.png' 1.0
New-Icon 512 'icon-maskable-512.png' 0.76
New-Icon 180 'apple-touch-icon.png' 1.0
New-Icon 32 'favicon-32.png' 1.0

Write-Output "Icônes générées dans $outDir"
