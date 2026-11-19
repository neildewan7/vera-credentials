#Requires -Version 7.0
# Loading defines helpers and clears prior helper session. No requests/tests run.
. (Join-Path $PSScriptRoot '../scenario-02/test-user-session.ps1')

function Invoke-VeraRevocationRequest {
    param([Parameter(Mandatory)][ValidateSet('ReadDegreeStatus','AttemptCertificatePatch')][string]$Operation)
    if (-not $script:VeraManualSession) { throw 'Run Connect-VeraManualUser first.' }
    $params = @{
        Method='GET'; SkipHttpErrorCheck=$true; MaximumRedirection=0; TimeoutSec=15
        Headers=@{apikey=$script:VeraManualSession.Key; Authorization="Bearer $($script:VeraManualSession.Token)"}
    }
    if ($Operation -eq 'ReadDegreeStatus') {
        $degreeHash = '0x' + ('b' * 64)
        $params.Uri = "http://127.0.0.1:54321/rest/v1/revocations?chain_id=eq.99111601&revocation_registry_address=eq.0x5555555555555555555555555555555555555555&doc_hash=eq.$degreeHash&select=*"
    } else {
        $certificateHash = '0x' + ('d' * 64)
        $params.Method = 'PATCH'
        $params.Uri = "http://127.0.0.1:54321/rest/v1/revocations?chain_id=eq.99111601&revocation_registry_address=eq.0x9999999999999999999999999999999999999999&doc_hash=eq.$certificateHash"
        $params.ContentType = 'application/json'
        # Valid but different timestamp: no-op payload/invalid reason cannot explain failure.
        $params.Body = @{revoked_at='2026-11-15T12:21:00Z'; reason=10} | ConvertTo-Json
        $params.Headers.Prefer = 'return=representation'
    }
    $response = Invoke-WebRequest @params
    Write-Host "User: $($script:VeraManualSession.Email) | $Operation | HTTP $([int]$response.StatusCode)"
    $response.Content
}

function Get-VeraManualDegreeRevocation { Invoke-VeraRevocationRequest -Operation ReadDegreeStatus }
function Invoke-VeraManualDeniedRevocationUpdate { Invoke-VeraRevocationRequest -Operation AttemptCertificatePatch }

function Get-VeraManualCertificateActivity {
    # An explicit user-invoked GET, using the actual signed-in user's permissions.
    # Does not equate hidden/missing status to active or revoked.
    if (-not $script:VeraManualSession) { throw 'Run Connect-VeraManualUser first.' }
    $certificateHash = '0x' + ('d' * 64)
    $response = Invoke-WebRequest -Method GET `
        -Uri "http://127.0.0.1:54321/rest/v1/revocations?chain_id=eq.99111601&revocation_registry_address=eq.0x9999999999999999999999999999999999999999&doc_hash=eq.$certificateHash&select=*" `
        -Headers @{apikey=$script:VeraManualSession.Key; Authorization="Bearer $($script:VeraManualSession.Token)"} `
        -SkipHttpErrorCheck -MaximumRedirection 0 -TimeoutSec 15
    Write-Host "User: $($script:VeraManualSession.Email) | Certificate activity | HTTP $([int]$response.StatusCode)"
    if ([int]$response.StatusCode -ne 200) { $response.Content; return }
    $rows = @($response.Content | ConvertFrom-Json)
    if ($rows.Count -eq 0) {
        [pscustomobject]@{Status='unknown_or_not_visible'; IsActive=$null}
    } elseif ($rows.Count -eq 1) {
        $row = $rows[0]
        $active = $null -eq $row.revoked_at
        [pscustomobject]@{
            Status=$(if ($active) {'active'} else {'revoked'}); IsActive=$active
            RegisteredAt=$row.registered_at; RevokedAt=$row.revoked_at; Reason=$row.reason
        }
    } else { throw 'Unexpected multiple status records. Stop and inspect.' }
}
