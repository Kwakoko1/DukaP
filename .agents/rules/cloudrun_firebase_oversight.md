# 🚀 Firebase App Hosting & Cloud Run Deployment Oversight Rule

**Trigger**: Model Decision / Autonomous Oversight Protocol
**Applies To**: Firebase App Hosting deployments, Cloud Run revision monitoring (`dkp` service / `dukapos-62425` project), Git pushes to `origin/main`.

---

## Directives

1. **Active Deployment Supervision**:
   - Oversee Firebase App Hosting build jobs and Cloud Run service revision health (`dkp` under project `dukapos-62425`).

2. **Automated Log Extraction on Failure**:
   - If a build or container startup failure occurs, immediately execute:
     ```bash
     gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dkp AND severity>=ERROR" --project=dukapos-62425 --billing-project=dukapos-62425 --limit=20 --format="json"
     ```

3. **Root Cause Analysis & Fix Protocol**:
   - Inspect exact stack traces and error logs.
   - Apply surgical code/config fixes directly in the codebase.
   - Run `npm run build` locally to verify 0 errors.
   - Push commit immediately to `origin/main` to resume clean cloud deployment.
