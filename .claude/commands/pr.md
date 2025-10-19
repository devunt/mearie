---
description: Create a pull request from staged changes
---

Create a pull request from the currently staged changes:

1. Check git status and show staged changes
2. Switch to main branch and pull latest changes
3. Create a new branch (ask user for branch name if not obvious from changes)
4. Commit the staged changes (ask user for commit message if not obvious)
5. Push to remote
6. Create a PR using gh cli (ask user for title and body if needed, keep body simple and concise)

Follow these guidelines:

- Use conventional commit format for commit messages
- Keep PR body simple and straightforward, not overly organized
- Write everything in English
