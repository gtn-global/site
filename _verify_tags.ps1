$html = Get-Content -Raw -Encoding UTF8 "Z:\GTN-site\gtn-global-site-3.0\events-index.html"
$chips = [regex]::Matches($html, '<button\b[^>]*\bdata-industry="([^"]*)"')
$rows = [regex]::Matches($html, '<tr\b[^>]*\bdata-industry="([^"]*)"')
$i = 0
foreach ($m in $chips) {
  $t = $m.Groups[1].Value
  if ($t -eq 'all') { continue }
  $i = $i + 1
  $c = 0
  foreach ($r in $rows) { if ($r.Groups[1].Value.Split(' ') -contains $t) { $c = $c + 1 } }
  Write-Host ("T" + $i + "=" + $c)
}
Write-Host ("ROWS=" + $rows.Count)
