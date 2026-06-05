# Codex instructions for this repo

This repo lives in WSL and should be edited, tested, and inspected using WSL-native tools only.

Default to:
- working directory paths under `/home/brett/...`
- Linux shell commands
- WSL-native `node`, `npm`, `python3`, `git`, and related tooling

Do not use Windows-native tools, PowerShell, `.exe` binaries, or paths under `/mnt/c` for this repo unless explicitly asked or as a last resort after WSL-native tools fail.

Before making code changes, if environment/tooling is uncertain, verify with:

```sh
pwd
uname -a
which node
which npm
which python3
which git