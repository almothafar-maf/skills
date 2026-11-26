-- metrics.sql: review-ci's metrics for each period, over runs.tsv and jobs.tsv imported as the tables runs and jobs.
--
-- Fill first: required(name), the names of the checks a merge requires, and periods(label, start_at, end_at), in UTC
-- ISO time; optionally kinds(sha, kind), 'docs' or 'code' for each push, else every push is 'all'.
-- Run: sqlite3 -header -column ci.db < metrics.sql
CREATE TABLE IF NOT EXISTS kinds(sha TEXT PRIMARY KEY, kind TEXT);
CREATE INDEX IF NOT EXISTS runs_head_sha ON runs(head_sha);
CREATE INDEX IF NOT EXISTS jobs_run_id ON jobs(run_id);

-- A push: a head SHA with a pull_request run, timed by its first run, in the period that time falls in. It counts only
-- when its jobs were fetched, so the pushes a sampled fetch skipped stay out of every figure.
DROP TABLE IF EXISTS m_push;
CREATE TABLE m_push AS
SELECT p.label AS period, p.start_at, s.sha, s.at, COALESCE(k.kind, 'all') AS kind
FROM (SELECT head_sha AS sha, MIN(created_at) AS at FROM runs WHERE event = 'pull_request' GROUP BY head_sha) AS s
JOIN periods AS p ON s.at >= p.start_at AND s.at < p.end_at
LEFT JOIN kinds AS k ON k.sha = s.sha
WHERE EXISTS (SELECT 1 FROM runs AS r JOIN jobs AS j ON j.run_id = r.id WHERE r.head_sha = s.sha);

-- The jobs of each push's pull_request and pull_request_target runs, every attempt. An execution is a job a runner
-- took that started after it was created: a re-run attempt also lists the jobs it carried over, which start before.
DROP TABLE IF EXISTS m_job;
CREATE TABLE m_job AS
SELECT p.period, p.start_at, p.kind, p.sha, p.at AS push_at, r.workflow, j.name AS job, j.conclusion, j.created_at,
       j.started_at, j.completed_at, j.labels AS pool,
       (j.runner_name != '' AND j.started_at >= j.created_at) AS executed,
       (julianday(j.started_at) - julianday(j.created_at)) * 86400.0 AS wait_s,
       (julianday(j.completed_at) - julianday(j.started_at)) * 86400.0 AS run_s
FROM m_push AS p
JOIN runs AS r ON r.head_sha = p.sha AND r.event IN ('pull_request', 'pull_request_target')
JOIN jobs AS j ON j.run_id = r.id;
CREATE INDEX m_job_sha_job ON m_job(sha, job);
CREATE INDEX m_job_sha_pool ON m_job(sha, pool);

.print
.print '1. Jobs each push ran on each runner pool: mean, typical (median), fewest and most; runner minutes per push'
WITH pools AS (SELECT DISTINCT pool FROM m_job WHERE executed),
n AS (SELECT p.period, p.start_at, p.kind, pools.pool,
             (SELECT COUNT(*) FROM m_job AS j WHERE j.sha = p.sha AND j.pool = pools.pool AND j.executed) AS jobs,
             (SELECT COALESCE(SUM(j.run_s), 0) FROM m_job AS j
              WHERE j.sha = p.sha AND j.pool = pools.pool AND j.executed) AS run_s
      FROM m_push AS p CROSS JOIN pools),
r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY period, kind, pool ORDER BY jobs) AS rn,
                COUNT(*) OVER (PARTITION BY period, kind, pool) AS pushes FROM n)
SELECT period, kind, pool, MAX(pushes) AS pushes, ROUND(AVG(jobs), 1) AS mean_jobs,
       MAX(CASE WHEN rn = (pushes + 1) / 2 THEN jobs END) AS median_jobs, MIN(jobs) AS fewest, MAX(jobs) AS most,
       ROUND(AVG(run_s) / 60.0, 1) AS runner_min
FROM r GROUP BY period, kind, pool HAVING SUM(jobs) > 0 ORDER BY MIN(start_at), kind, mean_jobs DESC;

.print
.print '2. Wait for a runner, per pool: mean, median, slowest 10%, worst, and executions that waited over 15 minutes'
WITH w AS (SELECT period, start_at, pool, wait_s, ROW_NUMBER() OVER (PARTITION BY period, pool ORDER BY wait_s) AS rn,
                  COUNT(*) OVER (PARTITION BY period, pool) AS n FROM m_job WHERE executed)
SELECT period, pool, MAX(n) AS executions, ROUND(AVG(wait_s)) AS mean_s,
       ROUND(MAX(CASE WHEN rn = (n + 1) / 2 THEN wait_s END)) AS median_s,
       ROUND(MAX(CASE WHEN rn = (9 * n + 9) / 10 THEN wait_s END)) AS p90_s,
       ROUND(MAX(wait_s)) AS worst_s, SUM(wait_s > 900) AS over_15_min
FROM w GROUP BY period, pool ORDER BY MIN(start_at), executions DESC;

.print
.print '3. Time to green: minutes from the push until every required check had passed or been skipped'
WITH green AS (SELECT period, kind, sha, push_at, job, MIN(completed_at) AS at FROM m_job
               WHERE conclusion IN ('success', 'skipped') AND job IN (SELECT name FROM required)
               GROUP BY period, kind, sha, push_at, job),
per AS (SELECT period, kind, (julianday(MAX(at)) - julianday(push_at)) * 1440.0 AS minutes FROM green
        GROUP BY period, kind, sha, push_at HAVING COUNT(*) = (SELECT COUNT(DISTINCT name) FROM required)),
r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY period, kind ORDER BY minutes) AS rn,
                COUNT(*) OVER (PARTITION BY period, kind) AS n FROM per),
stats AS (SELECT period, kind, MAX(n) AS went_green,
                 ROUND(MAX(CASE WHEN rn = (n + 1) / 2 THEN minutes END), 1) AS median_min,
                 ROUND(MAX(CASE WHEN rn = (9 * n + 9) / 10 THEN minutes END), 1) AS p90_min,
                 ROUND(MAX(minutes), 1) AS worst_min
          FROM r GROUP BY period, kind)
SELECT p.period, p.kind, COUNT(*) AS pushes, COALESCE(MAX(s.went_green), 0) AS went_green,
       MAX(s.median_min) AS median_min, MAX(s.p90_min) AS p90_min, MAX(s.worst_min) AS worst_min
FROM m_push AS p LEFT JOIN stats AS s ON s.period = p.period AND s.kind = p.kind
GROUP BY p.period, p.kind ORDER BY MIN(p.start_at), p.kind;

.print
.print '4. Repeat runs: pull_request runs of a workflow on a commit it had already checked'
WITH c AS (SELECT p.period, p.start_at, r.workflow, p.sha, COUNT(*) AS n FROM m_push AS p
           JOIN runs AS r ON r.head_sha = p.sha AND r.event = 'pull_request'
           GROUP BY p.period, p.start_at, r.workflow, p.sha)
SELECT period, workflow, SUM(n) AS runs, SUM(n - 1) AS repeats, ROUND(100.0 * SUM(n - 1) / SUM(n), 1) AS repeat_pct
FROM c GROUP BY period, workflow ORDER BY MIN(start_at), repeats DESC, runs DESC;

.print
.print '5. False reds: pushes with a check cancelled on a commit where the same check passed'
WITH fr AS (SELECT c.sha, COUNT(*) AS jobs FROM m_job AS c
            WHERE c.conclusion = 'cancelled' AND EXISTS (SELECT 1 FROM m_job AS s WHERE s.sha = c.sha AND s.job = c.job
                                                         AND s.conclusion IN ('success', 'skipped'))
            GROUP BY c.sha)
SELECT p.period, COUNT(*) AS pushes, COUNT(fr.sha) AS with_false_red, ROUND(100.0 * COUNT(fr.sha) / COUNT(*), 1) AS pct,
       COALESCE(SUM(fr.jobs), 0) AS cancelled_checks
FROM m_push AS p LEFT JOIN fr ON fr.sha = p.sha GROUP BY p.period ORDER BY MIN(p.start_at);

.print
.print '6. Per job: executions, pool, median run time, median and slowest-10% wait'
WITH x AS (SELECT period, start_at, workflow, job, pool, run_s, wait_s,
                  ROW_NUMBER() OVER (PARTITION BY period, workflow, job ORDER BY run_s) AS rr,
                  ROW_NUMBER() OVER (PARTITION BY period, workflow, job ORDER BY wait_s) AS rw,
                  COUNT(*) OVER (PARTITION BY period, workflow, job) AS n FROM m_job WHERE executed)
SELECT period, workflow, job, GROUP_CONCAT(DISTINCT pool) AS pool, MAX(n) AS executions,
       ROUND(MAX(CASE WHEN rr = (n + 1) / 2 THEN run_s END)) AS median_run_s,
       ROUND(MAX(CASE WHEN rw = (n + 1) / 2 THEN wait_s END)) AS median_wait_s,
       ROUND(MAX(CASE WHEN rw = (9 * n + 9) / 10 THEN wait_s END)) AS p90_wait_s
FROM x GROUP BY period, workflow, job ORDER BY MIN(start_at), executions DESC;
