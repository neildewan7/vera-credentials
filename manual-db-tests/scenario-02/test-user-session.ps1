#Requires -Version 7.0
# Loads the Scenario 1 login helper and defines Scenario 2 commands. No requests/tests run.
. (Join-Path $PSScriptRoot '../test-user-session.ps1')

function Invoke-VeraCertificateRequest {
    param([Parameter(Mandatory)][ValidateSet('Certificate','Link','Revocation','InsertCertificate','InsertLink')][string]$Operation)
    if (-not $script:VeraManualSession) { throw 'Run Connect-VeraManualUser first.' }
    $params = @{
        Method='GET'; SkipHttpErrorCheck=$true; MaximumRedirection=0; TimeoutSec=15
        Headers=@{apikey=$script:VeraManualSession.Key; Authorization="Bearer $($script:VeraManualSession.Token)"}
    }
    $certificateId = '0x' + ('c' * 64)
    $certificateHash = '0x' + ('d' * 64)
    switch ($Operation) {
        'Certificate' {
            $params.Uri = "http://127.0.0.1:54321/rest/v1/self_reported?chain_id=eq.99111601&registry_address=eq.0x8888888888888888888888888888888888888888&doc_id=eq.$certificateId&select=*"
        }
        'Link' {
            $params.Uri = "http://127.0.0.1:54321/rest/v1/credential_links?chain_id=eq.99111601&link_contract_address=eq.0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&child_doc_id=eq.$certificateId&select=*"
        }
        'Revocation' {
            $params.Uri = "http://127.0.0.1:54321/rest/v1/revocations?chain_id=eq.99111601&revocation_registry_address=eq.0x9999999999999999999999999999999999999999&doc_hash=eq.$certificateHash&select=*"
        }
        'InsertCertificate' {
            $params.Method = 'POST'
            $params.Uri = 'http://127.0.0.1:54321/rest/v1/self_reported'
            $params.ContentType = 'application/json'
            # Fresh ID/hash so a duplicate cannot masquerade as access denial.
            $params.Body = @{
                chain_id=99111601; registry_address='0x8888888888888888888888888888888888888888'
                revocation_registry_address='0x9999999999999999999999999999999999999999'
                doc_id=('0x' + ('e' * 64)); doc_hash=('0x' + ('f' * 64))
                holder_address='0x1111111111111111111111111111111111111111'
                uri='https://example.invalid/vera-manual-1115/unauthorized-certificate.json'
                registered_at='2026-11-15T12:11:00Z'
            } | ConvertTo-Json
        }
        'InsertLink' {
            # Run BEFORE the valid SQL link insertion to avoid a duplicate-key ambiguity.
            $params.Method = 'POST'
            $params.Uri = 'http://127.0.0.1:54321/rest/v1/credential_links'
            $params.ContentType = 'application/json'
            $params.Body = @{
                chain_id=99111601; link_contract_address='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
                child_registry_address='0x8888888888888888888888888888888888888888'; child_doc_id=$certificateId
                parent_registry_address='0x4444444444444444444444444444444444444444'
                parent_doc_id=('0x' + ('a' * 64)); holder_address='0x1111111111111111111111111111111111111111'
                linked_at='2026-11-15T12:15:00Z'
            } | ConvertTo-Json
        }
    }
    $response = Invoke-WebRequest @params
    Write-Host "User: $($script:VeraManualSession.Email) | $Operation | HTTP $([int]$response.StatusCode)"
    $response.Content
}

function Get-VeraManualCertificate { Invoke-VeraCertificateRequest -Operation Certificate }
function Get-VeraManualCertificateLink { Invoke-VeraCertificateRequest -Operation Link }
function Get-VeraManualCertificateRevocation { Invoke-VeraCertificateRequest -Operation Revocation }
function Invoke-VeraManualDeniedCertificateInsert { Invoke-VeraCertificateRequest -Operation InsertCertificate }
function Invoke-VeraManualDeniedLinkInsert { Invoke-VeraCertificateRequest -Operation InsertLink }
