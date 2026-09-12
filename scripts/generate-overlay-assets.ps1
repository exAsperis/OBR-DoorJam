Add-Type -AssemblyName System.Drawing

$publicDirectory = Join-Path $PSScriptRoot "..\public"

function Resize-Png {
  param(
    [Parameter(Mandatory)] [string] $Source,
    [Parameter(Mandatory)] [string] $Destination,
    [Parameter(Mandatory)] [int] $Width,
    [Parameter(Mandatory)] [int] $Height,
    [Parameter(Mandatory)] [System.Drawing.Rectangle] $DestinationRectangle
  )

  $sourceImage = [System.Drawing.Bitmap]::FromFile((Join-Path $publicDirectory $Source))
  $outputImage = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($outputImage)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($sourceImage, $DestinationRectangle)
  $outputImage.Save((Join-Path $publicDirectory $Destination), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $outputImage.Dispose()
  $sourceImage.Dispose()
}

function Tint-Png {
  param(
    [Parameter(Mandatory)] [string] $Source,
    [Parameter(Mandatory)] [string] $Destination,
    [Parameter(Mandatory)] [System.Drawing.Color] $Color
  )

  $sourceImage = [System.Drawing.Bitmap]::FromFile((Join-Path $publicDirectory $Source))
  $outputImage = New-Object System.Drawing.Bitmap $sourceImage.Width, $sourceImage.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $sourceImage.Height; $y++) {
    for ($x = 0; $x -lt $sourceImage.Width; $x++) {
      $pixel = $sourceImage.GetPixel($x, $y)
      $outputImage.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, $Color.R, $Color.G, $Color.B))
    }
  }
  $outputImage.Save((Join-Path $publicDirectory $Destination), [System.Drawing.Imaging.ImageFormat]::Png)
  $outputImage.Dispose()
  $sourceImage.Dispose()
}

Resize-Png "door-overlay-pill.png" "door-overlay-billboard.png" 56 32 ([System.Drawing.Rectangle]::new(0, 0, 56, 32))
foreach ($state in @("locked", "unlocked", "linked", "unlinked")) {
  Resize-Png "overlay-$state.png" "overlay-$state-billboard.png" 28 32 ([System.Drawing.Rectangle]::new(4, 6, 20, 20))
}

Tint-Png "overlay-unlinked.png" "overlay-linked-warning.png" ([System.Drawing.Color]::FromArgb(245, 158, 11))
Resize-Png "overlay-linked-warning.png" "overlay-linked-warning-billboard.png" 28 32 ([System.Drawing.Rectangle]::new(4, 6, 20, 20))
