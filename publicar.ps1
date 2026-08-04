<#
  publicar.ps1
  Copia la version mas reciente de las herramientas desde la carpeta de trabajo
  y las sube a GitHub Pages.

  Uso:  clic derecho > Ejecutar con PowerShell
        o:  powershell -ExecutionPolicy Bypass -File publicar.ps1
#>

$ErrorActionPreference = 'Stop'
$origen  = 'C:\Users\jlmv6\Documents\Claude\Impulso Base Business'
$destino = Split-Path -Parent $MyInvocation.MyCommand.Path

$archivos = @(
    @{src='hoja-de-costeo.html';           dst='hoja-de-costeo.html'},
    @{src='calculadora-regalias.html';     dst='calculadora-regalias.html'},
    @{src='Manual-Presentacion-Propuestas.html'; dst='manual.html'}
)

Write-Host "Copiando herramientas desde la carpeta de trabajo..." -ForegroundColor Cyan
foreach ($a in $archivos) {
    $src = Join-Path $origen $a.src
    if (-not (Test-Path $src)) { Write-Host "  ! No se encontro $($a.src)" -ForegroundColor Yellow; continue }
    Copy-Item $src (Join-Path $destino $a.dst) -Force
    Write-Host "  OK $($a.src) -> $($a.dst)" -ForegroundColor Green
}

Set-Location $destino

# Aviso si por error entro algun archivo que no deberia publicarse
$sospechosos = Get-ChildItem $destino -File | Where-Object {
    $_.Name -match '(?i)credencial|password|token|secret|finanza|sueldo|planilla|\.env'
}
if ($sospechosos) {
    Write-Host "`nATENCION: hay archivos que no deberian publicarse:" -ForegroundColor Red
    $sospechosos | ForEach-Object { Write-Host "   $($_.Name)" -ForegroundColor Red }
    $r = Read-Host "Escribe SI para continuar de todas formas"
    if ($r -ne 'SI') { Write-Host "Cancelado." -ForegroundColor Yellow; exit }
}

git add -A
$cambios = git status --porcelain
if (-not $cambios) { Write-Host "`nNo hay cambios que subir." -ForegroundColor Yellow; exit }

$fecha = Get-Date -Format 'yyyy-MM-dd HH:mm'
git commit -m "Actualiza herramientas del Programa Impulso ($fecha)"
git push

Write-Host "`nListo. En 1-2 minutos estara actualizado en:" -ForegroundColor Green
Write-Host "https://jlmv6161.github.io/impulso-movadera/" -ForegroundColor Cyan
