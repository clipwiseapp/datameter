# Troubleshooting

Common issues and fixes for Datameter deployments.

---

## 1. Databricks logging permissions

**Symptom:** Queries execute successfully but logs don't appear in Unity Catalog. Server logs show permission errors on CREATE CATALOG, CREATE SCHEMA, or INSERT.

**Cause:** The Databricks token doesn't have sufficient permissions to create or write to Unity Catalog.

**Fix:** The token used for `DATABRICKS_TOKEN` needs:
- `CREATE CATALOG` privilege (or use an existing catalog and set `DATABRICKS_LOG_CATALOG` accordingly)
- `CREATE SCHEMA` privilege on the target catalog
- `CREATE TABLE` and `INSERT` privileges on the target schema

If creating a new catalog is restricted, set `DATABRICKS_LOG_CATALOG` to an existing catalog the token has write access to — for example `main` or `analytics`. The schema and table will be created automatically on first query.

---

## 2. OAuth / HOST env var misconfiguration

**Symptom:** Claude.ai shows "Couldn't register with sign-in service" or "Connection issue" when adding the connector.

**Cause:** The `HOST` env var is not set or is set incorrectly, causing the OAuth metadata endpoint to return localhost URLs instead of the public domain.

**Fix:** Set `HOST` to the full public HTTPS URL of your deployment — no trailing slash:
HOST=https://datameter.yourcompany.com

Verify by hitting the metadata endpoint directly:

```bash
curl https://datameter.yourcompany.com/.well-known/oauth-authorization-server
```

The response should show `authorization_endpoint` and `token_endpoint` pointing to your public domain, not localhost.

---

## 3. Databricks token permission scope

**Symptom:** Queries fail with authentication or authorization errors from Databricks.

**Cause:** The token has insufficient scope for SQL execution or Unity Catalog access.

**Fix:** The token needs two types of access:
- SQL warehouse access — permission to execute statements against the configured `DATABRICKS_WAREHOUSE_ID`
- Unity Catalog write access — permission to create and insert into the log table (see issue 1 above)

If your organization uses service principals, create one with both permissions rather than using a personal access token. Personal access tokens work for initial testing but service principals are preferred for production.

---

## 4. Coolify — Docker Compose vs Dockerfile

**Symptom:** Container starts but the data volume isn't persisted, or environment variables aren't picked up correctly.

**Cause:** Coolify is using the Dockerfile directly instead of docker-compose.yml, which skips the volume mount configuration.

**Fix:** When creating the service in Coolify, select **Docker Compose** as the build method and point it at `docker-compose.yml`. Do not use the raw Dockerfile option — the volume mount for `./data:/app/data` is defined in docker-compose.yml and won't be applied otherwise.

---

## 5. Data volume persistence across deploys

**Symptom:** Query logs disappear after a redeploy or container restart.

**Cause:** The `./data` directory inside the container is ephemeral unless explicitly mounted as a persistent volume.

**Fix depends on your deployment platform:**

- **Coolify** — the `./data:/app/data` volume in docker-compose.yml handles this automatically. Confirm the volume is listed under your service in the Coolify UI.
- **Railway** — create a Railway Volume and mount it at `/app/data` in the service settings. Railway volumes persist across deploys but require explicit configuration.
- **Render** — add a persistent disk in the service's Advanced settings, mounted at `/app/data`. Available on paid plans.
- **Docker directly** — the volume mount in docker-compose.yml handles this. Confirm with `docker volume ls`.

Note: **Vercel is not suitable** for deploying the Datameter server. It runs serverless functions only and does not support persistent processes or file volumes. Use Coolify, Railway, Render, or any Docker-compatible host instead.

---

## 6. Outbound firewall rules blocking Databricks

**Symptom:** Queries time out or fail with network errors, even though Databricks credentials are correct.

**Cause:** The container can't reach the Databricks REST API because outbound traffic is blocked by a firewall rule.

**Fix:** Confirm the host server running the container allows outbound HTTPS traffic to your Databricks workspace URL on port 443. This is usually allowed by default but may be restricted in tightly controlled network environments.

Test from the host machine:

```bash
curl -I https://your-workspace.azuredatabricks.net
```

If this fails, work with your network team to allow outbound traffic to the Databricks workspace domain.

---

## 7. poll_sql_result timeout

**Symptom:** Claude receives a PENDING status and never gets results back, even for queries that should complete quickly.

**Cause:** The Databricks query is taking longer than expected to complete, and Claude stops polling before results are ready.

**Fix:** The Databricks backend uses a `wait_timeout` of 30 seconds. For complex queries against large tables this may not be enough. You can increase it by editing `src/backends/databricks.js`:

```javascript
{ statement: sql, warehouse_id: config.warehouseId, wait_timeout: '50s' }
```

Valid values are between 5s and 50s. If queries regularly exceed 50 seconds, consider optimizing the query or adding a LIMIT clause.

Alternatively, instruct Claude via your system prompt to always poll multiple times before giving up — Claude will naturally retry `poll_sql_result` if it receives a PENDING status.
