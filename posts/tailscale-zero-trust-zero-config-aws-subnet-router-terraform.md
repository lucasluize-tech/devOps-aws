---
title: "Zero Trust, Zero Config: Automating Tailscale Subnet Routers on AWS with Terraform"
author: "Lucas Luize"
excerpt: "From a Tailscale workshop to a Terraform-automated pair of subnet routers on AWS — no bastion, no public IPs, no SSH keys on instances. Tailscale's motto earned in code."
date: "2026-04-24"
slug: "tailscale-zero-trust-zero-config-aws-subnet-router-terraform"
banner: ""
tags: ["Tailscale", "AWS", "Terraform", "Infrastructure", "Automation", "DevOps"]
---

# Zero Trust, Zero Config: Automating Tailscale Subnet Routers on AWS with Terraform

Tailscale's motto is **zero trust, zero config**. I did not understand what that meant until a workshop showed me, and I did not believe it until I rebuilt the whole thing in Terraform and watched two EC2 instances join a tailnet and advertise a VPC without me touching them.

**TL;DR:** A Tailscale subnet router replaces the bastion + public-IP + SSH-key pattern with "is this device on my tailnet." I walked through the manual setup at a workshop, then automated it as a 2-node Auto Scaling Group on AWS using the official Tailscale cloud-init module. No bastion, no public IPs, no SSH keys on the instances. Self-healing. This is the part where "zero trust, zero config" stops being a slogan and starts being a stack.

(This picks up where my [WSL2 MTU debugging post](/post.html?slug=tailscale-wsl2-mtu-ssh-hang-debugging) left off — once my laptop could actually reach tailnet peers end-to-end, I went to learn Tailscale properly.)

## What "zero trust, zero config" actually means

- **Zero trust** — network membership is the boundary, not IP ranges or firewall rules. A packet reaches a workload only if both ends are on the tailnet and ACLs permit it. There is no "inside the VPC means trusted."
- **Zero config** — you do not provision VPN credentials, pre-shared keys, or IP pools. Nodes authenticate to your tailnet with an auth key, Tailscale handles NAT traversal, key rotation, and routing. You declare intent (advertise these routes, accept this tag) and the control plane makes it happen.

The workshop made both real with one pattern: the **subnet router**.

## The subnet router pattern

Put a node inside a VPC. Tell it to advertise the VPC CIDR to the tailnet. Every other node on the tailnet can now reach private IPs inside that VPC as if it were on the LAN.

That is it. One node, one flag, and a VPC that used to need a bastion and an IGW is reachable from any device in your tailnet — and only from devices in your tailnet.

## The manual run

The workshop flow, step by step, on a fresh EC2 instance in the workshop VPC (`172.16.0.0/16`):

1. Launch the instance, configure SSH for the initial bootstrap
2. Install Tailscale, run `tailscale up`
3. Ping from laptop to instance over the tailnet to confirm connectivity
4. Install `tcptraceroute` and `nmap-ncat` for network debugging
5. Enable IP forwarding in the kernel (Tailscale's subnet-router docs cover the exact `sysctl` settings)
6. Run `tailscale up --advertise-routes=172.16.0.0/16`
7. Accept the advertised subnet in the Tailscale admin portal

Done. My laptop reached anything inside that VPC by its private IP. No bastion. No public IP on the workload. The attack surface shrank to "is this device on the tailnet."

That is the shift. Not the commands — the change in what the network boundary actually is.

## Why I wanted to automate it

Manual works for a workshop. For anything real, a single instance doing route advertisement is a single point of failure. If it dies, the VPC becomes unreachable over the tailnet until you rebuild it.

Two things I wanted:

- **Bootstrap on boot** — a fresh instance joins the tailnet and starts advertising routes without me touching it
- **Self-healing** — if one router dies, traffic keeps flowing through the other while the ASG replaces it

Terraform plus an Auto Scaling Group covers both. "Zero config" scales when the config is declarative, versioned, and reproducible.

## The Terraform layout

Working dir: `/home/lucasluize/linux-lessons/aws-tailscale/`

`vpc.tf` — look up the pre-existing workshop VPC by tag, do not create one:

```hcl
data "aws_vpc" "tailscale_workshop" {
  filter {
    name   = "tag:Name"
    values = ["tailscale-workshop-vpc"]
  }
}
```

`variables.tf` — auth key stays sensitive, CIDR lives in one place:

```hcl
variable "tailscale_auth_key" {
  type      = string
  sensitive = true
}

variable "hostname" {
  type = string
}

variable "advertise_tags" {
  type = list(string)
}

locals {
  vpc_cidr = "172.16.0.0/16"
}
```

`user_data.tf` — the official Tailscale cloud-init module handles bootstrap:

```hcl
module "amz-tailscale-client" {
  source  = "tailscale/tailscale/cloudinit"
  version = "0.0.9"

  auth_key         = var.tailscale_auth_key
  enable_ssh       = true
  hostname         = var.hostname
  advertise_tags   = var.advertise_tags
  advertise_routes = [local.vpc_cidr]
  accept_routes    = false
  max_retries      = 10
  retry_delay      = 10
}
```

That module builds cloud-init that installs Tailscale, runs `tailscale up` with the right flags, enables IP forwarding, and turns on Tailscale SSH. No custom scripts to maintain. This is the "zero config" part that matters most — the bootstrap is a versioned module, not a bash script that rots.

`ec2.tf` — launch template, ASG, security group. Latest AL2023 AMI via data source, IMDSv2 enforced, rolling refresh on launch-template changes, SG opens 22 and ICMP:

```hcl
resource "aws_launch_template" "main" {
  # ... ami, instance_type, user_data from module ...

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }
}

resource "aws_autoscaling_group" "main" {
  name                = var.hostname
  max_size            = 2
  min_size            = 2
  desired_capacity    = 2
  vpc_zone_identifier = ["subnet-0b256f36e5d06cfd3"]

  launch_template {
    id      = aws_launch_template.main.id
    version = aws_launch_template.main.latest_version
  }

  instance_refresh {
    strategy = "Rolling"
  }
}
```

## The workflow

1. Generate a reusable, tagged Tailscale auth key (tag `autogroup:admin` for the workshop; scope narrower in production)
2. Drop it in `terraform.tfvars` (gitignored) with the hostname and advertise tags
3. `terraform init && terraform apply`
4. Two instances come up, cloud-init bootstraps Tailscale, each advertises the VPC CIDR
5. Approve the routes once in the Tailscale admin console
6. The ASG now runs as a self-healing subnet-router pair

No SSH keys on the instances. No bastion. No public IPs. The only inbound path into the VPC runs through the tailnet. That is zero trust at the infrastructure layer — the boundary is tailnet membership, enforced by ACLs in the Tailscale admin console, not by security group rules you have to audit quarterly.

## Tweaks that mattered after the first run

- **`locals { vpc_cidr = "172.16.0.0/16" }`** so the CIDR lives in one place and gets referenced everywhere. Changing the VPC later is a one-line edit, not a find-and-replace.
- **`vpc_zone_identifier = ["subnet-id"]`** (array, single subnet) instead of all AZs. Scope stayed clear: one workshop subnet, two routers in it.
- **`min = max = desired = 2`** for baseline HA. When instance refresh replaces one node, the other keeps advertising routes. No outage window.

## Why an ASG, not a plain EC2 resource

Three reasons:

- **Instance refresh** rolls replacements when the launch template changes. Upgrade the AMI, change the user data, bump the Tailscale version — the ASG replaces instances one at a time without downtime.
- **Self-healing** when an instance dies or gets terminated. The ASG brings up a new one, cloud-init rejoins the tailnet, routes come back.
- **Two nodes advertising the same routes** means Tailscale fails over transparently. The admin console shows both as route advertisers; traffic flows through whichever is healthy.

One EC2 resource cannot do any of that without external glue. The ASG is what lets "zero config" hold up under instance churn.

## Secrets hygiene

One practical note that bit me: the auth key lives in `terraform.tfvars`. That file has to be gitignored, and when I first committed this repo I got it wrong — the file went into history. Rotate the key in the admin console the moment that happens, then fix `.gitignore` and `git rm --cached` the file. Auth keys are capability tokens; treat them like AWS access keys, not like config.

## Takeaways

**Zero trust is a posture, not a product.** Tailscale gives you the primitives — identity-scoped nodes, tag-based ACLs, no implicit network trust — but you still have to build with them. A subnet router is the clearest example: one node, one flag, and suddenly VPC access is a question of tailnet membership, not IP.

**Zero config is a spectrum, and the cloud-init module is where it pays off.** Writing bash to bootstrap Tailscale on every new AMI would undo the whole premise. Using `tailscale/tailscale/cloudinit` means the config is versioned, tested by the vendor, and boring to upgrade.

**A 2-node subnet-router ASG is the cheapest "no bastion, no public IPs" you can buy.** Two t3.nano or t4g.nano instances, a cloud-init module someone else maintains, and an auth key. In exchange: every private IP in the VPC is reachable from every device on your tailnet, the routers self-heal, and the attack surface collapses to tailnet membership.

The shift is small in code, big in posture. You stop asking "what port is exposed on the internet" and start asking "what devices are on my tailnet." The first question has a bad answer most of the time. The second one you control.

If you run subnet routers in production, how do you handle route advertisement during instance refresh — let the ASG replace them naively, or drain one first? That is the next thing I want to solve.
