---
title: "Encrypting and Automating a Bitwarden Vault Backup, End to End"
author: "Lucas Luize"
excerpt: "I wanted to learn file encryption on Linux for real, so I picked the scariest file I own — a plaintext Bitwarden export — and built an unattended weekly backup that encrypts it, verifies it, and ships it to S3 without ever holding a key that can decrypt it."
date: "2026-06-26"
slug: "encrypting-automating-bitwarden-vault-backup"
banner: ""
tags: ["Security", "AWS", "Automation", "Docker", "DevOps"]
---

# Encrypting and Automating a Bitwarden Vault Backup, End to End

A Bitwarden vault export is a single plaintext file. Every password, every TOTP seed, every secure note I own, sitting in one JSON file with no protection beyond the permissions on the directory it lands in.

That file is the perfect thing to practice on. I wanted to learn file encryption on Linux for real — not toy `echo "hello" | openssl` examples, but the whole chain: encrypt, decrypt, checksum, sign, rotate keys, store locally and off-site. So I gave myself a task with actual stakes: a fully unattended weekly backup of that vault, with one hard rule — nothing on my laptop can ever decrypt it.

**TL;DR:** I built a 7-phase pipeline that pulls the Bitwarden vault, encrypts it with a public key (so the automation never holds a decryption key), checksums and signs it, stores it locally in a 3-2-1 layout, and pushes it to a versioned, hardened S3 bucket. A systemd user timer schedules it. AWS credentials get fetched at run time into ephemeral container secrets. Every AWS 403 I hit was least-privilege working correctly. The biggest lesson: a 403 means *ask why*, not *grant more*.

## Why public-key encryption is the whole design

The single decision that drives everything else: **the pipeline encrypts with a public key.**

Symmetric encryption — one shared secret for both encrypt and decrypt — is simpler, but it means the automation has to hold a key that can also decrypt the vault. If that pipeline ever gets compromised — a poisoned dependency, a leaked env var, a rogue script — the attacker walks away with the keys to every account I own.

Asymmetric encryption breaks that. The automation gets the public key. It can lock the vault but it physically cannot open it. The matching private key never goes near the weekly job — it only comes out when I need to restore, and I keep an offline copy of it. **A fully compromised pipeline leaks exactly one thing: ciphertext.**

That property — worst-case leak is ciphertext — is the spine. Every later decision either preserves it or it does not ship.

## The toolchain: hide, fingerprint, prove

Three jobs, three tools. Conflating them is how people build "encryption" that does not actually protect anything.

- **age — encrypt.** Modern, minimal, one flag to encrypt to a recipient's public key. This is the daily driver.
- **sha256sum — fingerprint.** A checksum proves the bytes did not rot or get truncated in transit. It says nothing about who made them.
- **gpg --detach-sign — prove origin.** A detached signature proves I produced this file, not someone who got write access to the bucket.

Encrypt hides. Hash fingerprints. Sign proves origin. A backup you cannot verify is a backup you cannot trust, and "I have a copy" is not the same as "I have a copy I know is intact and mine."

```bash
age -r age1ql3z... -o vault.json.age vault.json
sha256sum vault.json.age > vault.json.age.sha256
gpg --detach-sign --armor vault.json.age
```

I ran age and gpg side by side on purpose. age handles the encryption because it is hard to misuse — one recipient flag, no cipher-suite footguns. gpg handles signatures because its web-of-trust and detached-signature model is the classic, battle-tested answer for authenticity.

## Building the clean room with Podman

For a few seconds during each run, the vault exists as plaintext. That is unavoidable — you have to decrypt the Bitwarden export to re-encrypt it under my key. The real question: where does that plaintext live, and what can touch it?

I built the host script first, deliberately. Plain bash, no container, just to feel the problem: plaintext written to `/tmp`, cleanup on a trap, hope nothing crashes between write and shred. It works, but the plaintext touches the real filesystem and the cleanup is my responsibility.

Then I containerized it, and the difference is the point of the whole exercise. The container is a rootless Podman clean room:

```bash
podman run --rm --cap-drop ALL --read-only \
  --tmpfs /work:rw,noexec,nosuid,size=16m \
  --network none \
  -v "$PWD/age-recipient.txt:/keys/recipient.txt:ro" \
  vault-backup:latest
```

- `--read-only` root filesystem — nothing can be written except the one tmpfs I allow.
- `--tmpfs /work` — the plaintext lives in RAM. When the container exits, it is gone. No shred, no trap, no race.
- `--cap-drop ALL` — strip every Linux capability.
- `--network none` — during the encryption stage, the container cannot phone home. (The Bitwarden pull stage uses slirp4netns for outbound-only networking.)

Public key in, ciphertext out. That is the entire contract.

I chose Podman over Docker for one reason: the Docker daemon's `docker` group is effectively root. Rootless Podman runs as my user with no privileged daemon in the middle.

I want to be honest about what the container does and does not buy me. It shrinks the window plaintext exists, it contains a rogue dependency inside the toolchain, and it makes the whole thing portable. It is not a wall against a root-compromised host. I sell it on what it delivers — cleanup-by-default and supply-chain containment — not on security theater.

## Key rotation, because keys do not live forever

**age multi-recipient transition.** During a cutover, encrypt to both the old and new public keys:

```bash
age -r age1_OLD -r age1_NEW -o vault.json.age vault.json
```

Either private key decrypts it. Old backups stay readable, new backups already use the new key, no flag-day.

**gpg subkey rotation.** I rotate the encryption subkey while keeping the master identity, and I generated a revocation certificate ahead of time and stored it separately. If a key is compromised, revocation has to be something I can do immediately — not something I scramble to generate after the fact.

## Hardening the S3 bucket

- **Public access block** — all four settings on.
- **Versioning** — enabled, and load-bearing (more on that below).
- **Default encryption** — SSE-AES256 server-side, on top of my own client-side age encryption.
- **Bucket policy** — deny any request not over TLS, and deny any `PutObject` without the SSE header.
- **IAM user** — least privilege, scoped to one bucket prefix and one secret.

The bucket policy and the IAM policy do different jobs. Both have to allow an action for it to succeed, and that overlap is where I spent most of my debugging time.

## The versioning decision

The obvious way to keep history is timestamped filenames. Then I remembered S3 already does this. rclone pushes to a stable key name — always `vault.json.age` — and S3 native versioning keeps every prior version automatically. Local copies do stay timestamped and pruned. Each layer does its native job.

## Scheduling: systemd user timer over cron

A weekly job on a laptop has one nasty property: the laptop is often off when the job is due. Cron just skips it. A systemd user timer with `Persistent=true` catches missed runs. It also gives me ordering, real logs in `journalctl`, and status I can query. Cron would have been three lines shorter and silently wrong every time my machine was asleep on a Sunday.

## Secrets: the trade I made on purpose

The host fetches credentials at run time from AWS Secrets Manager, injects them into ephemeral Podman secrets, and removes them when the container exits. Nothing that can decrypt the vault persists locally.

The deliberate trade: I swapped the un-revocable Bitwarden master password for a scoped, revocable, CloudTrail-audited AWS key. If the AWS key leaks, I revoke it and see exactly what it touched. If the Bitwarden master password leaks, I am re-keying my entire digital life.

## The 403 saga (every one was correct)

Once the IAM user was scoped tight, the pipeline threw 403s at every stage. Every one was least privilege working as designed. The way you tell tool-overreach from too-narrow-policy is by naming the failing request:

```bash
rclone -vv --dump headers copy vault.json.age s3backup:my-bucket/prefix/
```

- `rclone lsd` → `ListAllMyBuckets` denied. Over-reach. Fix: list into the bucket, not across the account.
- `CreateBucket` 403 — rclone "ensuring" the bucket existed. Fix the tool: `no_check_bucket = true`.
- `PutObject` 403 — bucket policy rejecting uploads without the SSE header. Fix the tool: `server_side_encryption = AES256`.
- A self-healing "Attempt 1 failed / Attempt 2 succeeded" 403. `--dump headers` traced it to a post-upload `HEAD ?versionId=` needing `s3:GetObjectVersion`. Genuinely-too-narrow policy. Fix: grant that one action, scoped.
- `GetSecretValue` 403 — a policy statement I had written but never pushed. A deploy bug, not a logic bug.

Two said *constrain the tool*. Two said *grant one more action*. One said *you forgot to deploy your fix*. Without `--dump headers` naming the request, I would have guessed — and guessing on IAM means widening permissions until it works, which is how least privilege quietly dies.

## Verification and the final proof

Every phase had a verify gate, and I ran real restore drills — because a backup you have never restored is a hypothesis, not a backup.

```bash
sha256sum -c vault.json.age.sha256
gpg --verify vault.json.age.sig vault.json.age
age -d -i ~/keys/age-private.key vault.json.age | diff - vault.json
```

The final test: I ran `aws sso logout` to kill my interactive session, then let the timer fire on its own. A real 277 KB vault got pulled, encrypted, checksummed, stored locally, and pushed to versioned S3 — fully unattended. The plaintext never touched the disk.

## Takeaways

1. **A 403 means ask why, not grant more.** Name the failing request before you touch a policy.
2. **Public-key encryption caps your blast radius by architecture, not by hope.** The automation cannot leak what it cannot decrypt.
3. **Be honest about containers.** Rootless Podman shrinks the exposure window; it is not a wall against a rooted host.
4. **Your password manager's master password is a decryption key, not a login.** MFA does not protect it.
5. **A private key is portable plaintext.** Protect the bytes: encrypt the key, or encrypt the drive.
6. **Let each layer do its native job.** S3 versions, age encrypts, gpg signs — none of them doing the others' work.

I started this to learn age and gpg. I came out with a sharper mental model of blast radius — the habit of asking, for every secret and component, "if this one thing is fully compromised, what exactly does the attacker get?" The answer should be boring. For this pipeline, it is "some ciphertext and a revocable key."

What is the scariest plaintext file on your machine right now, and what would it cost you if it leaked tonight?
