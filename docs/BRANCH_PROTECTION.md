# Branch Protection

`main` must be protected in GitHub so changes cannot merge unless the independent CI jobs pass.

## Required status checks

Configure branch protection for `main` with these required checks:

| Required check | Purpose |
|---|---|
| `backend-tests` | FastAPI, CEDA, memory and database validation |
| `frontend-quality` | ESLint, TypeScript and production build |
| `action-engine` | CRUD, approval, undo and lineage contracts |
| `e2e-chromium` | Primary browser workflows |
| `e2e-webkit` | Safari compatibility |
| `accessibility` | Keyboard, screen-reader, senior-mode and text visibility checks |
| `offline-sync` | Queue, retry, conflict and tombstone behavior |
| `security` | Secrets, dependencies and unsafe action checks |

## Recommended GitHub settings

Enable:

- Require a pull request before merging.
- Require approvals.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Require signed commits when practical.
- Do not allow force pushes.
- Do not allow deletions.
- Include administrators if this repository is being operated as a production-grade project.

Do not enable auto-merge unless the team has explicitly approved it.

## Account/repository requirement

GitHub may reject branch protection updates on a private repository unless the repository/account plan supports protected branches for private repositories. If the API returns:

```text
Upgrade to GitHub Pro or make this repository public to enable this feature.
```

then the workflow checks are still defined in `.github/workflows/ci.yml`, but `main` cannot be enforced by GitHub branch protection until the repository is public or the account plan is upgraded.

## GitHub CLI example

Run only with repository admin permission:

```bash
gh api \
  --method PUT \
  repos/jyotiaai2020-netizen/Student-LAD/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "backend-tests",
      "frontend-quality",
      "action-engine",
      "e2e-chromium",
      "e2e-webkit",
      "accessibility",
      "offline-sync",
      "security"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

GitHub may require the exact check-run names shown in the branch protection UI. If names differ, use the names reported by the latest PR check run.
