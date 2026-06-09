# Capability Check Checklist

## Read probes

- [ ] page.url()
- [ ] page.title()
- [ ] page.snapshot()

## Write probes (only if page has a form)

- [ ] page.snapshot_data() before fill
- [ ] page.fill with object form `{ refId, value }`
- [ ] Re-snapshot to verify value

## Error recovery

- E_CONTENT_SCRIPT / receiving end does not exist → navigate to current URL once, retry read probe
- E_STALE ref → re-snapshot, use fresh refId
