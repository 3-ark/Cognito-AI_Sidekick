git fetch --prune

git branch -vv | ForEach-Object {
    if ($_ -match '^(?<name>\S+).+: gone\]') {
        Write-Host "Deleting gone branch: $($Matches['name'])"
        git branch -d $Matches['name']
    }
}
