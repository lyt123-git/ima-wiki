param([ValidateSet('refresh','sync','check')][string]$Action='refresh')
$ErrorActionPreference='Stop'
$wikiNode=if($env:WIKI_NODE){$env:WIKI_NODE}else{'node'}
if(!(Test-Path -LiteralPath $wikiNode)){$wikiNode=(Get-Command node -ErrorAction Stop).Source}
function Run-Script([string]$Script){& $wikiNode (Join-Path $PSScriptRoot $Script);if($LASTEXITCODE -ne 0){throw "$Script failed ($LASTEXITCODE)"}}
try {
    if($Action -eq 'check'){& $wikiNode (Join-Path $PSScriptRoot 'setup_check.js');exit $LASTEXITCODE}
    if($Action -eq 'sync'){Run-Script 'sync_ima.js'}
    Run-Script 'classify_raw.js'
    Run-Script 'gen_index.js'
    Run-Script 'validate_links.js'
    Run-Script 'build_view.js'
    exit 0
}catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
