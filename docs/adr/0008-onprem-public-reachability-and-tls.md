# ADR-0008: On-prem public reachability and TLS

**Status:** Proposed

## Context
Carmel runs on its own server (assumed high-end consumer PC) under `app.carmelpoly.in` (GoDaddy domain). Parents and students sign in from outside the campus. The legacy setup relied on an office PC plus Lightsail port forwarding, which exposed the office network and was a single point of failure. The server must be reachable with valid TLS without opening the campus network more than necessary.

## Options
1. **Outbound-only tunnel** from the server to a public edge (e.g. Cloudflare Tunnel, or a reverse tunnel to our Lightsail VM). No inbound ports on the campus router; TLS terminates at the edge. Needs DNS for `app.carmelpoly.in` pointed at the edge.
2. **Static public IP + port forwarding** to a reverse proxy on the server (Let's Encrypt). Simple, but exposes the campus network and depends on the ISP and a static IP.
3. **Cloud front door**: public traffic hits a small cloud proxy we run, which forwards over a private tunnel to the on-prem server.

## Proposed decision
Default to **option 1** for on-prem installs so the application server is never directly exposed. Keep option 2 as a documented fallback for colleges with a static IP and their own network team.

## Consequences
- The installer sets up the tunnel and records the public hostname in the landlord `domains` table.
- Internet loss stops parent access but not on-campus use; the offline-capable temporary-password login (ADR-0003) keeps working on the LAN.
- Backups go offsite on a schedule regardless of the tunnel.

## Open
- Does Carmel have a static IP, and who controls the GoDaddy DNS?
- Is campus-LAN access without internet a requirement for staff?
