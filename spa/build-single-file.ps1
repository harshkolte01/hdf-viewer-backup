param(
  [string]$OutputPath = "..\spa-single-page\index.html"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Join-Path $projectRoot "index.html"
$resolvedOutputPath =
if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path $projectRoot $OutputPath
}

function Test-IsEffectivelyEmptyCss {
  param(
    [string]$Content
  )

  $text = if ($null -eq $Content) { "" } else { [string]$Content }
  $withoutComments = [regex]::Replace($text, "/\*[\s\S]*?\*/", "")
  return [string]::IsNullOrWhiteSpace($withoutComments)
}

function Get-InlineStyleBlock {
  param(
    [string]$BasePath,
    [System.Text.RegularExpressions.MatchCollection]$Matches
  )

  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($match in $Matches) {
    $relativePath = $match.Groups[1].Value
    $fullPath = Join-Path $BasePath $relativePath

    if (-not (Test-Path $fullPath)) {
      throw "Missing stylesheet source: $relativePath"
    }

    $content = Get-Content -Raw $fullPath
    if (Test-IsEffectivelyEmptyCss -Content $content) {
      continue
    }

    $safeContent = $content -replace "</style", "<\/style"
    $parts.Add("    /* Source: $relativePath */")
    $parts.Add($safeContent.TrimEnd())
    $parts.Add("")
  }

  $joined = ($parts -join "`r`n").TrimEnd()
  return @"
    <style>
$joined
    </style>
"@
}

function Get-InlineScriptBlock {
  param(
    [string]$BasePath,
    [System.Text.RegularExpressions.MatchCollection]$Matches
  )

  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($match in $Matches) {
    $relativePath = $match.Groups[1].Value
    $fullPath = Join-Path $BasePath $relativePath

    if (-not (Test-Path $fullPath)) {
      throw "Missing script source: $relativePath"
    }

    $content = Get-Content -Raw $fullPath
    $safeContent = $content -replace "</script", "<\/script"
    $parts.Add("    <script data-source=""$relativePath"">")
    $parts.Add($safeContent.TrimEnd())
    $parts.Add("    </script>")
    $parts.Add("")
  }

  return ($parts -join "`r`n").TrimEnd()
}

function Replace-MatchRange {
  param(
    [string]$Text,
    [System.Text.RegularExpressions.MatchCollection]$Matches,
    [string]$Replacement
  )

  if ($Matches.Count -eq 0) {
    return $Text
  }

  $first = $Matches[0]
  $last = $Matches[$Matches.Count - 1]
  $start = $first.Index
  $end = $last.Index + $last.Length

  while ($end -lt $Text.Length -and ($Text[$end] -eq "`r" -or $Text[$end] -eq "`n" -or $Text[$end] -eq " ")) {
    $end += 1
  }

  return $Text.Substring(0, $start) + $Replacement + $Text.Substring($end)
}

if (-not (Test-Path $indexPath)) {
  throw "Cannot find source index.html at $indexPath"
}

$html = Get-Content -Raw $indexPath

$styleMatches = [regex]::Matches($html, '<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*/?>')
$scriptMatches = [regex]::Matches($html, '<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>')

if ($styleMatches.Count -eq 0) {
  throw "No stylesheet links found in $indexPath"
}

if ($scriptMatches.Count -eq 0) {
  throw "No external scripts found in $indexPath"
}

$styleBlock = Get-InlineStyleBlock -BasePath $projectRoot -Matches $styleMatches
$scriptBlock = Get-InlineScriptBlock -BasePath $projectRoot -Matches $scriptMatches

$bundledHtml = Replace-MatchRange -Text $html -Matches $styleMatches -Replacement $styleBlock
$bundledHtml = Replace-MatchRange -Text $bundledHtml -Matches ([regex]::Matches($bundledHtml, '<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>')) -Replacement $scriptBlock

$outputDir = Split-Path -Parent $resolvedOutputPath
if ($outputDir -and -not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Set-Content -Path $resolvedOutputPath -Value $bundledHtml -Encoding UTF8
Write-Output "Generated $resolvedOutputPath"
