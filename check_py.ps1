Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd.Length -gt 130) { $cmd = $cmd.Substring(0, 130) }
  "{0}  {1}" -f $_.ProcessId, $cmd
}
