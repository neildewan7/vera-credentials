# PowerShell 7+. Uses only the running local stack; no credentials are written to disk.
# Creates synthetic users/records and removes them in finally. CLI is pinned for reproducibility.
$ErrorActionPreference = 'Stop'
$cliOutput = & npx.cmd --yes supabase@3.1.0 status --output json
if ($LASTEXITCODE -ne 0) { throw 'Start the local Supabase stack before running this test.' }
$local = $cliOutput | ConvertFrom-Json
$base = [Uri]$local.API_URL
if (-not $base.IsLoopback -or $base.Scheme -ne 'http') { throw 'Refusing to test a non-local endpoint.' }
$checks = 0
function Request-Api([string]$Method, [string]$Path, [string]$Token, $Body = $null) {
  $params = @{
    Method = $Method; Uri = "$($base.AbsoluteUri.TrimEnd('/'))/$Path"
    Headers = @{ apikey = $local.ANON_KEY; Authorization = "Bearer $Token" }
    SkipHttpErrorCheck = $true
  }
  if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = ConvertTo-Json -Depth 10 -InputObject $Body }
  Invoke-WebRequest @params
}
function Check([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw "FAIL: $Label" }
  $script:checks++
}
function Check-Status($Response, [int[]]$Allowed, [string]$Label) {
  Check ($Response.StatusCode -in $Allowed) "$Label (HTTP $($Response.StatusCode))"
}
function Hex([int]$Digits) { '0x' + (([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')).Substring(0, $Digits)) }
$users = @()
$registry = Hex 40
$revocation = Hex 40
$selfRegistry = Hex 40
$selfRevocation = Hex 40
$linkContract = Hex 40
$factory = Hex 40
$holderWallet = Hex 40
$otherWallet = Hex 40
$issuerWallet = Hex 40
$docId = Hex 64
$docHash = Hex 64
$childId = Hex 64
$childHash = Hex 64
try {
  foreach ($name in @('holder', 'other')) {
    $email = "vera-$name-$([guid]::NewGuid().ToString('N'))@example.invalid"
    $password = [guid]::NewGuid().ToString('N') + 'aA1!'
    $created = Request-Api POST 'auth/v1/admin/users' $local.SERVICE_ROLE_KEY @{email=$email;password=$password;email_confirm=$true}
    Check-Status $created @(200,201) 'create local Auth user'
    $user = $created.Content | ConvertFrom-Json
    $users += $user.id
    $session = Request-Api POST 'auth/v1/token?grant_type=password' $local.ANON_KEY @{email=$email;password=$password}
    Check-Status $session @(200) 'password sign-in via real Auth'
    $token = ($session.Content | ConvertFrom-Json).access_token
    $profile = Request-Api POST 'rest/v1/accounts' $token @{id=$user.id;display_name='Synthetic API test'}
    Check-Status $profile @(201) 'create own profile via REST'
    if ($name -eq 'holder') { $holderToken = $token; $holderId = $user.id; $wallet = $holderWallet }
    else { $otherToken = $token; $otherId = $user.id; $wallet = $otherWallet }
    # Test fixture only: in the app, this operation requires server-side proof of wallet ownership.
    $verified = Request-Api PATCH "rest/v1/accounts?id=eq.$($user.id)" $local.SERVICE_ROLE_KEY @{wallet_address=$wallet;wallet_verified_at=[DateTime]::UtcNow.ToString('o')}
    Check-Status $verified @(204) 'trusted backend sets wallet association'
  }
  foreach ($table in @('accounts','issuers','registries','documents','self_reported','credential_links','revocations','consent_settings','chain_events','indexer_checkpoints')) {
    $response = Request-Api GET "rest/v1/$($table)?select=*" $local.ANON_KEY
    Check-Status $response @(401,403) "anonymous access denied: $table"
  }
  $response = Request-Api GET 'rest/v1/accounts?select=*' $holderToken
  Check-Status $response @(200) 'holder profile read'
  $rows = @($response.Content | ConvertFrom-Json)
  Check ($rows.Count -eq 1 -and $rows[0].id -eq $holderId) 'profile read isolates the JWT subject'
  $response = Request-Api PATCH "rest/v1/accounts?id=eq.$holderId" $holderToken @{display_name='Updated synthetic profile'}
  Check-Status $response @(204) 'own profile update permitted'
  $response = Request-Api PATCH "rest/v1/accounts?id=eq.$holderId" $holderToken @{wallet_address=$otherWallet}
  Check-Status $response @(403) 'client wallet reassignment denied'
  $response = Request-Api POST 'rest/v1/consent_settings' $holderToken @{account_id=$holderId;settings=@{pending_review=$true}}
  Check-Status $response @(201) 'own consent creation permitted'
  $response = Request-Api PATCH "rest/v1/consent_settings?account_id=eq.$holderId" $holderToken @{settings=@{pending_review=$false}}
  Check-Status $response @(204) 'own consent update permitted'
  $response = Request-Api GET 'rest/v1/consent_settings?select=*' $otherToken
  Check-Status $response @(200) 'other user consent query succeeds without exposure'
  Check (@($response.Content | ConvertFrom-Json).Count -eq 0) 'other user cannot read holder consent'

  $time = [DateTime]::UtcNow.ToString('o')
  $response = Request-Api POST 'rest/v1/registries' $local.SERVICE_ROLE_KEY @{
    chain_id=80002;verification_registry_address=$registry;factory_address=$factory;registry_id=1;template_type=0
    original_owner_address=$issuerWallet;owner_address=$issuerWallet;revocation_registry_address=$revocation
    config_hash=$docHash;name='Synthetic API test registry';created_at=$time
  }
  Check-Status $response @(201) 'service-role registry projection write'
  $response = Request-Api POST 'rest/v1/documents' $local.SERVICE_ROLE_KEY @{
    chain_id=80002;registry_address=$registry;doc_id=$docId;doc_hash=$docHash
    issuer_address=$issuerWallet;holder_address=$holderWallet;uri='';issued_at=$time
  }
  Check-Status $response @(201) 'service-role document projection write'
  $response = Request-Api POST 'rest/v1/self_reported' $local.SERVICE_ROLE_KEY @{
    chain_id=80002;registry_address=$selfRegistry;revocation_registry_address=$selfRevocation
    doc_id=$childId;doc_hash=$childHash;holder_address=$holderWallet;uri='';registered_at=$time
  }
  Check-Status $response @(201) 'service-role self-report projection write'
  $response = Request-Api POST 'rest/v1/credential_links' $local.SERVICE_ROLE_KEY @{
    chain_id=80002;link_contract_address=$linkContract;child_registry_address=$selfRegistry
    child_doc_id=$childId;parent_registry_address=$registry;parent_doc_id=$docId;holder_address=$holderWallet;linked_at=$time
  }
  Check-Status $response @(201) 'service-role link projection write'
  $response = Request-Api POST 'rest/v1/revocations' $local.SERVICE_ROLE_KEY @{
    chain_id=80002;revocation_registry_address=$revocation;doc_hash=$docHash;registered_at=$time
  }
  Check-Status $response @(201) 'service-role revocation projection write'
  foreach ($target in @(
    @{Table='documents';Filter="registry_address=eq.$registry"},
    @{Table='self_reported';Filter="registry_address=eq.$selfRegistry"},
    @{Table='credential_links';Filter="link_contract_address=eq.$linkContract"},
    @{Table='revocations';Filter="revocation_registry_address=eq.$revocation"}
  )) {
    $route = "rest/v1/$($target.Table)?select=*&chain_id=eq.80002&$($target.Filter)"
    $response = Request-Api GET $route $holderToken
    Check-Status $response @(200) "holder reads own $($target.Table)"
    Check (@($response.Content | ConvertFrom-Json).Count -eq 1) "holder sees own $($target.Table) record"
    $response = Request-Api GET $route $otherToken
    Check-Status $response @(200) "other holder query: $($target.Table)"
    Check (@($response.Content | ConvertFrom-Json).Count -eq 0) "other holder cannot read $($target.Table) record"
  }
  foreach ($table in @('chain_events','indexer_checkpoints')) {
    $response = Request-Api GET "rest/v1/$($table)?select=*" $holderToken
    Check-Status $response @(403) "authenticated access to internal $table denied"
  }
  $response = Request-Api PATCH "rest/v1/documents?registry_address=eq.$registry" $holderToken @{uri='forged'}
  Check-Status $response @(403) 'holder cannot overwrite indexed facts'
  Write-Output "PASS: $checks real Auth/REST checks on the local Supabase stack"
}
finally {
  # Narrow filters remove only records generated by this run, in FK-safe order.
  foreach ($target in @(
    @{Table='credential_links';Filter="link_contract_address=eq.$linkContract"},
    @{Table='self_reported';Filter="registry_address=eq.$selfRegistry"},
    @{Table='documents';Filter="registry_address=eq.$registry"},
    @{Table='revocations';Filter="revocation_registry_address=eq.$revocation"},
    @{Table='registries';Filter="verification_registry_address=eq.$registry"}
  )) {
    $response = Request-Api DELETE "rest/v1/$($target.Table)?chain_id=eq.80002&$($target.Filter)" $local.SERVICE_ROLE_KEY
    if ($response.StatusCode -ne 204) { throw "Cleanup failed: $($target.Table) HTTP $($response.StatusCode)" }
  }
  foreach ($id in $users) {
    $response = Request-Api DELETE "auth/v1/admin/users/$id" $local.SERVICE_ROLE_KEY
    if ($response.StatusCode -notin @(200,204)) { throw "Local Auth user cleanup failed (HTTP $($response.StatusCode))" }
  }
}
