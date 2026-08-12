## Summary

- 

## Architecture checklist

- [ ] Preserves Kamal / Workspace AI / CEDA role boundaries.
- [ ] Durable data goes through CEDA, Context OS, PIE, WKIM, memory, or connector service as appropriate.
- [ ] Voice and text commands use the same governed action path.
- [ ] User-scoped data remains isolated.
- [ ] Sensitive data is masked and policy-governed.
- [ ] New persistent records have stable unique IDs and audit/log paths.
- [ ] No duplicate canonical screen or workflow was introduced.

## Tests

- [ ] `scripts/verify-fast.sh`
- [ ] `scripts/verify-full.sh`
- [ ] Other:

## Screenshots / notes

Add screenshots, trace notes, or known limitations here.
