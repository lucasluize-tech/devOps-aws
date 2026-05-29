---
title: "Shared Dashboard State on the Tailnet With Zero Config"
author: "Lucas Luize"
excerpt: "The job-search dashboard was a one-person tool with localStorage, until the work scaled to two people across three devices. The fix was a stdlib HTTP server fronted by tailscale serve, kept alive by a systemd user unit."
date: "2026-05-28"
slug: "tailnet-shared-dashboard-zero-config"
banner: ""
tags: ["Tailscale", "Python", "Automation", "Infrastructure", "DevOps"]
---

# Shared Dashboard State on the Tailnet With Zero Config

The job-search dashboard was built for one person clicking checkboxes in one browser. `localStorage` was the right tool for that shape of problem, and I picked it on purpose. Then the shape of the problem changed.

Applying to jobs turned out to be more work than either of us budgeted for, so it became a joint effort. Anelise applies from her Mac during the day. I apply from my Linux box after work. Sometimes I tap through a few from my phone between things. Two people, multiple devices, one question we both kept asking: "did we already do this one?" Per-browser state cannot answer that.

The migration was small and the payoff was bigger than the code. A stdlib HTTP server, fronted by `tailscale serve`, kept alive by a systemd user unit. Private HTTPS on every device we own, with no certs to renew and no DNS to register. Auth is the tailnet itself. That last part is the one I want to shout about.

## TL;DR

The job-search pipeline generates a static `dashboard.html` for tracking applications. State started in `localStorage` because the original applier was one person on one Mac, and that was the simplest thing that fit. When applying became a joint effort across her Mac, my Linux box, and my phone, the "shared" boundary moved from one browser to every device we own, and the storage had to move with it. A 110-line stdlib HTTP server now owns `state.json`, a systemd user unit keeps it running, and `tailscale serve` exposes it as HTTPS on the tailnet.

## The Requirement Changed

The dashboard is the human side of my job-search pipeline. Each job gets a row, each row gets a checkbox for "applied," and the pipeline writes the file out fresh on every run.

The original deal was clean. I generate the listings on Linux. Anelise does the boring half from her Mac, which is the actual submitting through company portals. One applier, one browser, one source of truth. `localStorage` was the deliberate YAGNI choice. Anything else would have been infrastructure built for users that did not exist.

Then we ran the numbers on how long an application actually takes when you read the posting, tailor the resume, write the cover letter notes, and fight whatever ATS the company uses. Anelise was not going to do all of that alone, and I was not going to make her. So I started applying too. From the Linux box at night. From my phone in line at the pharmacy. From wherever.

That moved the boundary. "Shared state" used to mean "what does Anelise's Safari think?" It now meant "what do Anelise's Safari, my Chrome on Linux, and my Chrome on Android all agree on?" `localStorage` is scoped to one browser profile by design, and that design was no longer the design I wanted. Nothing about it was broken. It just stopped matching the requirement.

Once the boundary moved off a single browser, the state had to move off the browser too. Onto a host that all our devices could reach.

## The Goal

One source of truth for check state, reachable from every device on the tailnet. Anelise keeps her Finder folder of PDFs as the offline fallback so she can apply even if my Linux box is off.

Concretely:

- A single host owns `state.json`
- Every browser fetches and posts to that host
- The URL is HTTPS without me touching certs or DNS
- The service stays up across logouts and reboots
- The Mac never receives `dashboard.html`, because a local HTML file pointing at an unreachable server is worse than no file at all

## The Server

Two routes is not a Flask job. The whole thing is a `SimpleHTTPRequestHandler` subclass plus a `threading.Lock`. `src/dashboard_server.py` is about 110 lines, all stdlib.

```python
class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/state":
            with STATE_LOCK:
                payload = json.dumps(read_state()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        return super().do_GET()

    def do_POST(self):
        if self.path != "/state":
            self.send_error(404)
            return
        patch = self._read_json_body()
        if patch is None:
            return  # _read_json_body already sent 400/413
        with STATE_LOCK:
            state = read_state()
            for job_id, value in patch.items():
                if value is False:
                    state.pop(job_id, None)
                else:
                    state[job_id] = bool(value)
            write_state_atomic(state)
        self.send_response(204)
        self.end_headers()
```

A few details that mattered:

- **Atomic writes.** `write_state_atomic` writes to a tempfile in the same directory via `tempfile.mkstemp`, then `os.replace`. A crash mid-write cannot leave a half-written `state.json`, because `os.replace` is atomic on the same filesystem.
- **One process-wide lock.** `STATE_LOCK = threading.Lock()` wraps every read-modify-write. Two POSTs from two devices land on two threads inside the same process, and the lock keeps them from clobbering each other.
- **`false` deletes.** A patch of `{"abc-123": false}` removes the key instead of storing it. The dashboard sends `false` when the user unchecks a box, so the file never grows monotonically with dead state.
- **Body validation.** Malformed JSON gets 400. A top-level non-object gets 400. Non-boolean values get 400. Payloads over the cap get 413. The server trusts nothing from the wire.

Run it with `python -m src.dashboard_server`. That is the whole runtime.

## The Sync Script Had Three Bugs Waiting

`src/sync_to_mac.py` rebuilds `build/mac-sync/` from scratch every run and rsyncs it to Anelise's MacBook. Moving state into a server meant three surgical changes to that script.

**Snapshot `state.json` before `shutil.rmtree(STAGING_DIR)`.** The rebuild was happily nuking the staging dir, which now contained the only copy of everyone's checkmarks. The fix is two lines: read `state.json` into memory before the rmtree, write it back after the rebuild.

**Exclude `dashboard.html` and `state.json` from the rsync.** Both belong to the local server. Pushing them to the Mac would either ship stale snapshots or, worse, delete them on the next run if `--delete` ever came back into play. The Mac wants PDFs only.

**Swap the embedded JS.** The dashboard's `<script>` block used to read and write `localStorage`. Now it does `fetch('/state')` on load and `fetch('/state', { method: 'POST', body: JSON.stringify({ [jobId]: checked }) })` on toggle. I deliberately did not add a `localStorage` fallback when the fetch fails. A `console.warn` is louder than a silent fallback that masks a dead server.

## Keeping It Up With systemd

A Python process that dies when I close my terminal is not a service. `~/.config/systemd/user/job-dashboard.service`:

```ini
[Unit]
Description=Job Search Dashboard Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/lucasluize/projects/job-search
ExecStart=/home/lucasluize/projects/job-search/venv/bin/python -m src.dashboard_server
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now job-dashboard.service
```

Then the one command almost everyone misses the first time:

```bash
loginctl enable-linger $USER
```

Without linger, the user systemd manager shuts down when you log out, and it takes every user service with it. I learned this on a previous project by SSHing in the next morning and finding nothing running. Linger tells systemd to keep the user manager alive across logouts, which is exactly what you want for a background daemon you ran with `--user`.

`journalctl --user -u job-dashboard.service -f` tails the logs. `Restart=on-failure` with `RestartSec=3` brings it back if it panics.

## Tailscale Serve Is the Trick

The dashboard server listens on `localhost:8888`. That is private to the box. The bridge to the tailnet is one command:

```bash
tailscale serve --bg --https=443 http://localhost:8888
```

`--bg` registers it persistently so it survives reboots. `--https=443` tells Tailscale to terminate TLS on port 443. The local target is plain HTTP because there is no reason to encrypt loopback.

From any device on my tailnet, the dashboard is at `https://<host>.<tailnet>.ts.net/dashboard.html`. The cert is signed by Let's Encrypt, provisioned by Tailscale for the `.ts.net` hostname, and renewed automatically. No DNS to configure. No public port to open. Tailnet membership is the auth boundary, enforced by Tailscale's control plane and my ACLs.

One quirk worth knowing: Tailscale Serve only signs HTTPS on ports 443, 8443, and 10000. Pick one of those for the public side, then map it to whatever local port you want.

## Design Choices I Considered and Rejected

**Flask or FastAPI.** Two routes do not justify a dependency. Stdlib `http.server` plus a lock comes in around 110 lines and ships with Python.

**Syncthing so everyone has a local copy.** Two browsers can both toggle a checkbox at the same time. With syncthing, that turns into a file-level merge conflict the user has to resolve. One host serving the state means the lock resolves it for them.

**Server-sent events or WebSockets for live updates.** Anelise and I are not checking boxes in a tight loop. We refresh the page when we sit down to apply. A push channel would have been more code for a problem I do not have.

**A `localStorage` fallback if `/state` fails.** Tempting, and wrong. If the server is down, I want to see it in the console and fix it, not have the dashboard silently regress to the broken-per-browser behavior that started this whole project.

## Tests

I wrote this with a strict TDD loop. Eight commits, each one a failing test, then the minimal implementation that turned it green.

The tests that earned their place:

- **Atomic write under crash.** Truncate the tempfile, assert `state.json` is still the previous good copy.
- **Concurrent merge from 20 threads.** A `threading.Barrier(20)` so all threads release together, each posting a unique key, then assert all 20 keys are present after the storm. The lock has nowhere to hide.
- **Full HTTP round-trip.** Start the server on an OS-assigned port with `HTTPServer(("127.0.0.1", 0), DashboardHandler)`, hit it with `urllib`, assert response codes and body shape.
- **Body validation matrix.** Malformed JSON, top-level array, non-bool value, oversized payload. Each expects a specific 400 or 413.

The final suite is 161 tests, all green. The dashboard server is small enough that I trust it because I can read all of it in one sitting and every behavior has a test backing it.

## Takeaways

**Pick state scope to match the boundary of who needs to see it, and be ready to move when the boundary moves.** `localStorage` was right when one person on one browser owned the work. It became wrong the day a second person and a third device joined. The storage choice was not a bug, it was a fit, and fits expire when requirements grow. The signal to migrate was not an error message. It was the second time one of us asked "wait, did you already apply to that one?"

**`loginctl enable-linger` is the piece between "I have a systemd user service" and "it actually stays up."** Skipping it is how I have lost background services twice. Now it is the first thing I run after `systemctl --user enable`.

**Tailscale Serve removes the boring parts of self-hosting.** No certbot. No public DNS record to register. The combination of a stdlib server, a systemd unit, and `tailscale serve --bg --https=443` gave me a private HTTPS service reachable from every device I own, with a Python file I can read in one sitting.

What is a single-user tool of yours that turned into a shared one? How did you handle the migration when the boundary of "shared" moved?
