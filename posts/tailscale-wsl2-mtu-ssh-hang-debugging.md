---
title: "SSH Hangs at KEX_ECDH_REPLY: A WSL2 Tailscale MTU Black Hole"
author: "Lucas Luize"
excerpt: "An SSH session to a healthy tailnet peer hung forever at the key exchange. tailscale ping worked. The bug was 80 bytes of WireGuard overhead and an MTU I thought I had already checked."
date: "2026-04-24"
slug: "tailscale-wsl2-mtu-ssh-hang-debugging"
banner: ""
tags: ["Tailscale", "Networking", "DevOps", "Debugging", "Infrastructure"]
---

# SSH Hangs at KEX_ECDH_REPLY: A WSL2 Tailscale MTU Black Hole

```
debug1: SSH2_MSG_KEXINIT sent
debug1: SSH2_MSG_KEXINIT received
debug1: kex: algorithm: curve25519-sha256
debug1: expecting SSH2_MSG_KEX_ECDH_REPLY
```

Then nothing. `ssh -vvv` sat there. `tailscale ping` to the same peer came back healthy. `tailscale status` was green. The peer was on my tailnet, reachable, and refusing to finish an SSH handshake.

**TL;DR:** A WSL2 MTU misconfiguration dropped every SSH packet larger than ~1280 bytes over Tailscale. Small packets made it through, big ones vanished, and `tailscale ping` reported the connection as usable. The fix was one `ip link` command. The lesson was about MTU as a relationship, not a value.

## The symptom

I was on a WSL2 Ubuntu box. The peer (`epl-linux`) was another node on my tailnet. Both machines showed healthy in `tailscale status`. Routing table 52 — the one Tailscale installs — had the peer. SSH should have worked.

It did not. The session hung at `expecting SSH2_MSG_KEX_ECDH_REPLY` forever.

That line is where the SSH server sends its host key and signature back to the client. It is the first large packet in the handshake — somewhere between 1 and 2 KB. Everything before it is tiny. Everything that matters after it is big.

## The things that worked (which is what made this hard)

```bash
$ tailscale ping epl-linux
pong from epl-linux via DERP(ord) in 42ms
pong from epl-linux via DERP(ord) in 41ms

$ tailscale status
100.x.x.x   epl-linux   lucas@   linux   active; relay "ord"
```

Ping worked. Status was clean. `ip route show table 52` had the route. If I stopped here I would have blamed the SSH server.

The clue hiding in plain sight: Tailscale's own ping uses an 8-byte payload. The KEXINIT that SSH sends is also small. Everything I had tested so far was tiny traffic.

## The MTU black hole

Tailscale wraps every packet in WireGuard, which adds ~80 bytes of overhead. Your physical interface (`eth0` in WSL2) has to be **bigger than** `tailscale0`, not equal to it, or WG-wrapped packets exceed the outer MTU. Tailscale sets the Don't Fragment bit, so oversized packets do not fragment — they disappear.

Healthy looks like this:

```
eth0        mtu 1500
tailscale0  mtu 1280
```

What I had:

```
eth0        mtu 1280
tailscale0  mtu 1280
```

No headroom for the WireGuard header. Tiny packets squeaked through because the wrap still fit under 1280. The SSH server's `KEX_ECDH_REPLY` at ~1.2 KB, once wrapped, blew past the outer MTU and dropped on the wire.

A black hole, not a closed port. Nothing bounces back. The client waits.

## Confirming it

```bash
ip -br link show
# eth0             UP    mtu 1280
# tailscale0       UNKNOWN  mtu 1280

ping -M do -c 2 -s 1252 100.x.x.x
# -M do sets Don't Fragment. Payload 1252 + 28 ICMP/IP = 1280 on the wire.
# With a healthy MTU this passes. With the black hole it drops.
```

The ping dropped. That is the signature: small pings fine, pings sized to `tailscale0`'s MTU gone.

## The fix

Temporary — reverts on WSL restart:

```bash
sudo ip link set dev eth0 mtu 1500
```

Persistent, via `/etc/wsl.conf`:

```ini
[boot]
command = ip link set dev eth0 mtu 1500
```

Sanity check from the Windows side (PowerShell, admin):

```powershell
Get-NetIPInterface | Where-Object AddressFamily -eq IPv4 |
  Select-Object InterfaceAlias, NlMtu
```

Physical adapters and `vEthernet (WSL)` should read 1500. The Windows Tailscale adapter at 1280 is expected — that is `tailscale0` on the Windows side.

After the fix, SSH completed in under a second.

## A note on DERP

Tailscale's DERP relays are the fallback when direct UDP hole-punching fails. WSL2 sits behind double NAT (WSL2's internal NAT, then Windows' NAT), which breaks direct connections often enough that DERP is the default path, not a fault state.

When `tailscale ping` says `via DERP(ord)`, that is not a bug — it is the network doing its job. Slower than direct, but reliable. DERP becomes a problem only when you care about latency-sensitive workloads, and at that point you fix the NAT layer, not Tailscale.

## Useful Tailscale diagnostics

```bash
tailscale status                 # peers, direct vs relay, health warnings
tailscale ping <peer>            # data path check, says direct or DERP
tailscale netcheck               # NAT type, UDP reachability, DERP latencies
tailscale whois <tailscale-ip>   # who owns this 100.x address
tailscale debug prefs            # RunSSH, AdvertiseRoutes, local prefs

ip rule                          # Tailscale uses fwmark + table 52
ip route show table 52           # routes tailscaled installs for peers
ip route get <peer-ip>           # which table/interface is picked
```

One more WSL2 thing: running Tailscale on both the Windows host and inside WSL2 works fine. They are two independent nodes on the tailnet, not in conflict. If the SSH banner on a peer reads `Tailscale` instead of `OpenSSH_...`, that peer has `tailscale up --ssh` enabled and Tailscale's embedded SSH is handling the connection — not OpenSSH.

## The lesson under the lesson

"I already checked MTU" means nothing if you only looked at the numbers. MTU is a relationship, not a value. `tailscale0` has to sit below `eth0` by at least the WireGuard header (~80 bytes). Equal is broken. Smaller is broken.

Signature to remember:

- SSH hangs at `expecting SSH2_MSG_KEX_ECDH_REPLY`
- `tailscale ping` works (small packets via DERP)
- `ping -M do -s <large> peer` drops
- `eth0` MTU is less than or equal to `tailscale0` MTU

Once WSL2 could actually talk to tailnet peers end-to-end, I went to a Tailscale workshop to learn the platform proper — subnet routers, ACLs, the "zero trust, zero config" story — and then rebuilt it all with Terraform on AWS. That is the next post.

What is the weirdest packet-size-dependent bug you have chased? The ones that look like everything works until one specific thing does not — those are the debugging stories worth keeping.
