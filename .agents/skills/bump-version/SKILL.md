---
name: bump-version
description: Use when user asks to bump the version of the Project.
---

# Workflow for bumping the version of the Project

1. Check current version in package.json and in git tags
2. Most likely they will match
3. Update package.json with a patch / minor version / major version according to user's demands.
4. Stage and commit package.json with commit message 'Bump to version vA.B.C'. Eg. 'Bump to version v0.3.2'.
5. Update git tag, and push the tag accordingly. Remember, git tags always go with a 'v' prefix. Eg. Wrong: git tag 0.4.0; Correct: git tag v0.4.0

Done!
