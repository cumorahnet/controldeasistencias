param(
    [string]$Source = (Join-Path $PSScriptRoot "..\icons\custom-app-icon.png")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$iconsDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\icons"))
$sourcePath = [System.IO.Path]::GetFullPath($Source)

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "No se encontro la imagen maestra: $sourcePath"
}

function Export-SquarePng {
    param(
        [System.Drawing.Image]$Image,
        [string]$OutputPath,
        [int]$Size,
        [double]$ContentScale = 1.0
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $drawSize = [int][Math]::Round($Size * $ContentScale)
        $offset = [int][Math]::Round(($Size - $drawSize) / 2)
        $destination = New-Object System.Drawing.Rectangle($offset, $offset, $drawSize, $drawSize)
        $graphics.DrawImage($Image, $destination, 0, 0, $Image.Width, $Image.Height, [System.Drawing.GraphicsUnit]::Pixel)
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
    if ($sourceImage.Width -ne $sourceImage.Height) {
        throw "La imagen maestra debe ser cuadrada; mide $($sourceImage.Width)x$($sourceImage.Height)."
    }

    Export-SquarePng $sourceImage (Join-Path $iconsDirectory "app-icon-192.png") 192
    Export-SquarePng $sourceImage (Join-Path $iconsDirectory "app-icon-512.png") 512
    Export-SquarePng $sourceImage (Join-Path $iconsDirectory "apple-touch-icon.png") 180
    Export-SquarePng $sourceImage (Join-Path $iconsDirectory "app-icon-maskable-512.png") 512 0.78
}
finally {
    $sourceImage.Dispose()
}

Write-Output "Iconos PWA generados desde $sourcePath"
