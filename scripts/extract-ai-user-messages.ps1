[CmdletBinding()]
param(
    [string]$CodexRoot = (Join-Path $env:USERPROFILE '.codex'),
    [string]$ClaudeHistoryPath = (Join-Path $env:USERPROFILE '.claude\history.jsonl'),
    [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'content\Clippings\AI session 用户原话全量导出.md')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-SharedFileLines {
    param([string]$Path)

    $stream = [IO.FileStream]::new(
        $Path,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::ReadWrite
    )
    $reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false), $true)

    try {
        while (-not $reader.EndOfStream) {
            $reader.ReadLine()
        }
    }
    finally {
        $reader.Dispose()
        $stream.Dispose()
    }
}

function ConvertTo-DateTimeOffset {
    param(
        [AllowNull()]
        [object]$Value,
        [DateTimeOffset]$Fallback
    )

    if ($null -eq $Value) {
        return $Fallback
    }

    try {
        return [DateTimeOffset]::Parse(
            [string]$Value,
            [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::AssumeUniversal
        )
    }
    catch {
        return $Fallback
    }
}

function Get-SessionIdFromFileName {
    param([string]$BaseName)

    $matches = [regex]::Matches(
        $BaseName,
        '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    )
    if ($matches.Count -eq 0) {
        return $BaseName
    }

    return $matches[$matches.Count - 1].Value
}

function Expand-ClaudePastedText {
    param(
        [AllowEmptyString()]
        [string]$Display,
        [AllowNull()]
        [object]$PastedContents,
        [ref]$ReplacementCount,
        [ref]$UnplacedCount
    )

    $message = $Display
    if ($null -eq $PastedContents) {
        return $message
    }

    $properties = @($PastedContents.PSObject.Properties)
    foreach ($property in $properties) {
        $paste = $property.Value
        if ($null -eq $paste) {
            continue
        }

        $typeProperty = $paste.PSObject.Properties['type']
        $contentProperty = $paste.PSObject.Properties['content']
        if (
            $null -eq $typeProperty -or
            [string]$typeProperty.Value -ne 'text' -or
            $null -eq $contentProperty -or
            $null -eq $contentProperty.Value
        ) {
            continue
        }

        $idProperty = $paste.PSObject.Properties['id']
        $id = if ($null -ne $idProperty) { [string]$idProperty.Value } else { [string]$property.Name }
        $content = [string]$contentProperty.Value
        $pattern = '\[Pasted [^\]\r\n]*#' + [regex]::Escape($id) + '(?!\d)[^\]\r\n]*\]'
        $placeholder = [regex]::Match($message, $pattern)

        if ($placeholder.Success) {
            $message = $message.Substring(0, $placeholder.Index) +
                $content +
                $message.Substring($placeholder.Index + $placeholder.Length)
            $ReplacementCount.Value++
        }
        else {
            if ($message.Length -gt 0 -and -not $message.EndsWith("`n")) {
                $message += "`n`n"
            }
            $message += $content
            $UnplacedCount.Value++
        }
    }

    return $message
}

function Append-RawMessage {
    param(
        [Text.StringBuilder]$Builder,
        [int]$Number,
        [pscustomobject]$Entry
    )

    $localTime = $Entry.Timestamp.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz')
    [void]$Builder.AppendLine("### $Number · $localTime")
    [void]$Builder.AppendLine("<!-- session: $($Entry.SessionId) -->")
    [void]$Builder.AppendLine()
    [void]$Builder.Append($Entry.Message)
    if (-not $Entry.Message.EndsWith("`n")) {
        [void]$Builder.AppendLine()
    }
    [void]$Builder.AppendLine()
}

$codexMessages = [Collections.Generic.List[object]]::new()
$claudeMessages = [Collections.Generic.List[object]]::new()
$codexSeen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$claudeSeen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$codexParseErrors = 0
$claudeParseErrors = 0
$pasteReplacementCount = 0
$unplacedPasteCount = 0
$sequence = 0

$codexFiles = @(
    Get-ChildItem -LiteralPath $CodexRoot -Recurse -File -Filter 'rollout-*.jsonl' -ErrorAction SilentlyContinue |
        Sort-Object FullName
)

foreach ($file in $codexFiles) {
    $sessionId = Get-SessionIdFromFileName -BaseName $file.BaseName
    $fallbackTimestamp = [DateTimeOffset]$file.LastWriteTime

    foreach ($line in Read-SharedFileLines -Path $file.FullName) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $record = $line | ConvertFrom-Json -Depth 100
        }
        catch {
            $codexParseErrors++
            continue
        }

        if (
            [string]$record.type -ne 'event_msg' -or
            [string]$record.payload.type -ne 'user_message' -or
            $null -eq $record.payload.message
        ) {
            continue
        }

        $message = [string]$record.payload.message
        $timestamp = ConvertTo-DateTimeOffset -Value $record.timestamp -Fallback $fallbackTimestamp
        $dedupeKey = "$sessionId`n$($timestamp.ToUnixTimeMilliseconds())`n$message"
        if (-not $codexSeen.Add($dedupeKey)) {
            continue
        }

        $sequence++
        [void]$codexMessages.Add([pscustomobject]@{
            Timestamp = $timestamp
            SessionId = $sessionId
            Message = $message
            Sequence = $sequence
        })
    }
}

if (Test-Path -LiteralPath $ClaudeHistoryPath) {
    foreach ($line in Read-SharedFileLines -Path $ClaudeHistoryPath) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $record = $line | ConvertFrom-Json -Depth 100
        }
        catch {
            $claudeParseErrors++
            continue
        }

        if ($null -eq $record.display) {
            continue
        }

        $sessionId = [string]$record.sessionId
        $rawTimestamp = [long]$record.timestamp
        $dedupeKey = "$sessionId`n$rawTimestamp`n$([string]$record.display)"
        if (-not $claudeSeen.Add($dedupeKey)) {
            continue
        }

        $message = Expand-ClaudePastedText `
            -Display ([string]$record.display) `
            -PastedContents $record.pastedContents `
            -ReplacementCount ([ref]$pasteReplacementCount) `
            -UnplacedCount ([ref]$unplacedPasteCount)
        $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($rawTimestamp)
        $sequence++

        [void]$claudeMessages.Add([pscustomobject]@{
            Timestamp = $timestamp
            SessionId = $sessionId
            Message = $message
            Sequence = $sequence
        })
    }
}

$codexMessages = @($codexMessages | Sort-Object Timestamp, Sequence)
$claudeMessages = @($claudeMessages | Sort-Object Timestamp, Sequence)
$generatedAt = [DateTimeOffset]::Now
$totalMessages = $codexMessages.Count + $claudeMessages.Count

$builder = [Text.StringBuilder]::new()
[void]$builder.AppendLine('---')
[void]$builder.AppendLine("generated_at: $($generatedAt.ToString('yyyy-MM-dd HH:mm:ss zzz'))")
[void]$builder.AppendLine("message_count: $totalMessages")
[void]$builder.AppendLine("codex_message_count: $($codexMessages.Count)")
[void]$builder.AppendLine("claude_message_count: $($claudeMessages.Count)")
[void]$builder.AppendLine('---')
[void]$builder.AppendLine()
[void]$builder.AppendLine('# AI session 用户原话全量导出')
[void]$builder.AppendLine()
[void]$builder.AppendLine('由脚本从本机 Codex 与 Claude 的结构化历史记录生成。消息正文保留原文，Claude 的粘贴文本占位符已尽可能还原。')
[void]$builder.AppendLine()
[void]$builder.AppendLine('## Codex')
[void]$builder.AppendLine()

for ($index = 0; $index -lt $codexMessages.Count; $index++) {
    Append-RawMessage -Builder $builder -Number ($index + 1) -Entry $codexMessages[$index]
}

[void]$builder.AppendLine('## Claude')
[void]$builder.AppendLine()

for ($index = 0; $index -lt $claudeMessages.Count; $index++) {
    Append-RawMessage -Builder $builder -Number ($index + 1) -Entry $claudeMessages[$index]
}

$outputDirectory = Split-Path -Parent $OutputPath
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
[IO.File]::WriteAllText($OutputPath, $builder.ToString(), [Text.UTF8Encoding]::new($false))

[pscustomobject]@{
    OutputPath = $OutputPath
    OutputBytes = (Get-Item -LiteralPath $OutputPath).Length
    CodexFiles = $codexFiles.Count
    CodexMessages = $codexMessages.Count
    ClaudeMessages = $claudeMessages.Count
    TotalMessages = $totalMessages
    CodexParseErrors = $codexParseErrors
    ClaudeParseErrors = $claudeParseErrors
    PastedTextsRestored = $pasteReplacementCount
    PastedTextsAppended = $unplacedPasteCount
}
