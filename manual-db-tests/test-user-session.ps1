#Requires -Version 7.0
# Dot-source to define helpers. Loading this file makes NO requests and runs NO tests.
# All requests use this literal loopback address; redirects are disabled.
$script:VeraManualSession = $null

function Connect-VeraManualUser {
    param([Parameter(Mandatory)][ValidateSet('holder','issuer','other')][string]$User)
    $script:VeraManualSession = $null
    $clientKey = Read-Host 'Paste LOCAL anon or publishable key (never service_role/secret)'
    if (-not $clientKey.StartsWith('sb_publishable_')) {
        try {
            $part = $clientKey.Split('.')[1].Replace('-', '+').Replace('_', '/')
            $part = $part.PadRight([int]([Math]::Ceiling($part.Length / 4.0) * 4), '=')
            $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json
            if ($claims.role -ne 'anon') { throw 'Not an anon key' }
        } catch { throw 'Use a local anon JWT or sb_publishable_ key. Privileged keys are refused.' }
    }
    $email = "vera-manual-$User-1115@example.invalid"
    $securePassword = Read-Host "Password for $email" -AsSecureString
    $credential = [pscredential]::new($email, $securePassword)
    $body = @{email=$email; password=$credential.GetNetworkCredential().Password} | ConvertTo-Json
    try {
        $response = Invoke-WebRequest -Method Post `
            -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' `
            -Headers @{apikey=$clientKey} -ContentType 'application/json' -Body $body `
            -SkipHttpErrorCheck -MaximumRedirection 0 -TimeoutSec 15
        if ([int]$response.StatusCode -ne 200) {
            throw "Sign-in failed (HTTP $([int]$response.StatusCode)). Check local user/password and email confirmation."
        }
        $session = $response.Content | ConvertFrom-Json
        if (-not $session.access_token -or -not $session.user.id) { throw 'No authenticated user session returned.' }
        $script:VeraManualSession = @{
            Key=$clientKey; Token=$session.access_token; Email=$email; Id=$session.user.id
        }
        Write-Host "Signed in as $email (Auth UUID $($session.user.id)). No tests have run."
    } finally {
        $body = $null; $credential = $null; $securePassword = $null
        $session = $null; $response = $null; $clientKey = $null
    }
}

function Invoke-VeraManualRequest {
    param([Parameter(Mandatory)][ValidateSet('GET','POST')][string]$Method,
          [Parameter(Mandatory)][ValidateSet('ReadDegree','AttemptInsert')][string]$Operation)
    if (-not $script:VeraManualSession) { throw 'Run Connect-VeraManualUser first.' }
    $headers = @{
        apikey=$script:VeraManualSession.Key
        Authorization="Bearer $($script:VeraManualSession.Token)"
    }
    $params = @{
        Method=$Method; Headers=$headers; SkipHttpErrorCheck=$true
        MaximumRedirection=0; TimeoutSec=15
    }
    if ($Operation -eq 'ReadDegree' -and $Method -eq 'GET') {
        $params.Uri = 'http://127.0.0.1:54321/rest/v1/documents?chain_id=eq.99111601&registry_address=eq.0x4444444444444444444444444444444444444444&select=*'
    } elseif ($Operation -eq 'AttemptInsert' -and $Method -eq 'POST') {
        $params.Uri = 'http://127.0.0.1:54321/rest/v1/documents'
        $params.ContentType = 'application/json'
        # Different valid ID/hash: failure must be permission denial, not duplicate-key denial.
        $params.Body = @{
            chain_id=99111601
            registry_address='0x4444444444444444444444444444444444444444'
            doc_id=('0x' + ('d' * 64)); doc_hash=('0x' + ('e' * 64))
            issuer_address='0x2222222222222222222222222222222222222222'
            holder_address='0x1111111111111111111111111111111111111111'
            uri='https://example.invalid/vera-manual-1115/unauthorized.json'
            issued_at='2026-11-15T12:06:00Z'
        } | ConvertTo-Json
    } else { throw 'Unsupported method/operation pair.' }
    $response = Invoke-WebRequest @params
    Write-Host "User: $($script:VeraManualSession.Email) | HTTP $([int]$response.StatusCode)"
    $response.Content
}

function Get-VeraManualDegree { Invoke-VeraManualRequest -Method GET -Operation ReadDegree }
function Invoke-VeraManualDeniedInsert { Invoke-VeraManualRequest -Method POST -Operation AttemptInsert }
function Disconnect-VeraManualUser { $script:VeraManualSession = $null; Write-Host 'Local session cleared from helper memory. Close this PowerShell window when finished.' }
