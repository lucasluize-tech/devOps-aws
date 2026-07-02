---
title: "Building a Proxmox Homelab Foundation with Terraform: Six Tasks, Many Traps"
author: "Lucas Luize"
excerpt: "I spent a week wiring up Terraform for my remote Proxmox homelab. Here's what the bpg/proxmox provider doesn't tell you: the resource naming trap, the content-type gotcha, and why the tools you reach for to debug cloud-init lie to you."
date: "2026-07-02"
slug: "proxmox-terraform-foundation-lucaslab"
banner: ""
tags: ["DevOps", "Infrastructure", "Terraform", "Proxmox", "Homelab", "Automation"]
---

In [Part 1](https://devops.lucasluize.com/post.html?slug=tailscale-wsl2-mtu-ssh-hang-debugging), I chased an SSH handshake that kept stalling and traced it back to a low Tailscale PMTU. I thought that lesson was closed. It turned out to be the first tax I'd pay for running a Proxmox node I only reach over Tailscale, and it followed me straight into this build. This post is what came next: standing up a Terraform foundation for that node, and every trap the bpg/proxmox provider let me walk into.

**TL;DR:** I built a Terraform foundation for lucaslab, my Proxmox VE 9.2.3 homelab server: provider auth, cloud image download, a Tailscale bootstrap snippet, a generic VM template, and a validation VM. This post walks every trap I hit: the `proxmox_vm` vs `proxmox_virtual_environment_vm` naming trap, why `content_type = "import"` matters, why `qm cloudinit dump` shows you the wrong config, and how to debug a VM that boots but never joins your tailnet.

## The setup

lucaslab is a Proxmox server I only reach remotely. Tailscale is the only path in: no LAN fallback, no VPN failover, nothing. The Proxmox web UI sits at `https://lucaslab.[tailnet].ts.net:8006/`. It has a Let's Encrypt cert issued through Tailscale's MagicDNS, so I don't need `insecure = true` in the provider block. That surprised me.

The provider is bpg/proxmox v0.111. My `terraform@pve` API token has minimal permissions. I'm not running as root, and I'm not going to start. The Makefile has `make fmt`, `make validate`, `make test`, `make plan`, and `make apply`. That's it.

The goal for the whole project: `ssh ubuntu@tf-validation` over Tailscale succeeds. Six tasks to get there.

## Task 1: Provider auth

The provider block is short:

```hcl
provider "proxmox" {
  endpoint = "https://lucaslab.[tailnet].ts.net:8006/"
  api_token = var.proxmox_api_token
  ssh {
    agent = true
  }
}
```

The `terraform@pve` token needs API access to manage VMs, download files to storage, and read node info. Nothing else. I created it in the Proxmox UI under Datacenter → Permissions → API Tokens and assigned a role with just what the provider needs.

The bpg provider drives most operations through the API, but a few (file uploads to storage, in particular) go through SSH. The `ssh { agent = true }` block tells it to use my SSH agent for those. Make sure `lucaslab` is in your `~/.ssh/config` and your key is loaded in the agent.

## Task 2: Cloud image download

This is where I burned time. The resource looks simple:

```hcl
resource "proxmox_download_file" "ubuntu_2404" {
  node_name    = "lucaslab"
  content_type = "import"
  datastore_id = "local"
  url          = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
  file_name    = "noble-server-cloudimg-amd64.qcow2"
}
```

Two things burned me. First: `content_type = "import"`, not `"iso"`. PVE 9 introduced the `import` content type for disk images that get converted into VM disks. Set `content_type = "iso"` and the download works, but the VM disk step later fails because the content type doesn't match.

Second: `file_name` must end in `.qcow2`. The source URL ends in `.img`, but Proxmox reads the file extension to determine format. Without `.qcow2`, the import step fails.

Before any of this works, you have to enable the `import` content type on the `local` storage:

```bash
pvesm set local --content backup,iso,vztmpl,snippets,import
```

You can also set this in the Proxmox UI under Datacenter → Storage → local → Edit. Skip it and the download resource creates the file, but the VM disk step fails with a misleading error about storage permissions.

## Task 3: The Tailscale bootstrap snippet

This task cost me the most iterations. The cloud-init template lives at `cloud-init/tailscale.yaml.tftpl`:

```yaml
#cloud-config
packages:
  - qemu-guest-agent

write_files:
  - path: /etc/systemd/system/tailscaled.service.d/mtu-fix.conf
    content: |
      [Service]
      Environment="TS_DEBUG_MTU=1080"

runcmd:
  - curl -fsSL https://tailscale.com/install.sh | sh
  - systemctl daemon-reload
  - systemctl restart tailscaled
  - tailscale up --ssh --authkey=${tailscale_authkey} --advertise-tags=tag:lab --hostname=tf-validation
```

A few decisions worth explaining.

**Why `qemu-guest-agent` in packages:** Ubuntu cloud images don't ship it. If you set `agent { enabled = true }` in the VM resource, Terraform waits for the agent to report an IP before it treats `apply` as done. When the guest agent isn't installed, that wait never resolves: Terraform sits for 15 minutes and times out. I learned this by watching a progress bar go nowhere.

**Why `TS_DEBUG_MTU=1080`:** The WSL2 to lucaslab Tailscale path has a low PMTU, around 1140 bytes. It's the same black-hole I unpacked in [Part 1](https://devops.lucasluize.com/post.html?slug=tailscale-wsl2-mtu-ssh-hang-debugging). Left uncapped, large packets vanish: Terraform API calls die with EOF and cloud-init downloads stall. The systemd drop-in sets the environment variable for `tailscaled` before the daemon starts, and the `daemon-reload` plus `restart tailscaled` sequence in `runcmd` makes it take effect. On the WSL2 side, I also set `net.ipv4.tcp_mtu_probing=1`.

**Why `--advertise-tags=tag:lab`:** My Tailscale ACL's `dst` entries use `tag:lab`. Without the tag, the VM joins the tailnet but SSH from my laptop hits an ACL mismatch. This failed silently. The VM looked healthy, Tailscale showed it connected, and every SSH attempt timed out. The Tailscale admin panel's "Access controls" tab showed the problem in seconds.

**The authkey and git safety:** The `.tftpl` file in git keeps `${tailscale_authkey}` as a literal placeholder. The real snippet lives at `/var/lib/vz/snippets/tailscale.yaml` on the Proxmox host, with the key substituted by hand. The secret never touches git. The tradeoff: `cicustom` points at the host file, not a Terraform-managed resource. For a homelab, that's acceptable.

One trap: forget to substitute the placeholder and the VM boots, cloud-init runs, Tailscale installs, and `tailscale up` fails with a key parse error. The VM looks like it's running fine. It never joins the tailnet. Nothing shows up in `terraform apply` output because the VM did boot. The cloud-init failure is invisible from Terraform's side. Check `journalctl -u cloud-final` on the VM.

## Task 4: Generic VM template

```hcl
resource "proxmox_virtual_environment_vm" "ubuntu_template" {
  name          = "ubuntu-2404-template"
  node_name     = var.vm_node_name
  template      = true
  machine       = "q35"
  bios          = "ovmf"
  tags          = ["terraform", "ubuntu2404"]
  description   = "Managed by Terraform"
  scsi_hardware = "virtio-scsi-single"

  operating_system { type = "l26" }
  agent { enabled = true }

  lifecycle {
    ignore_changes = [
      ipv4_addresses,
      ipv6_addresses,
      network_interface_names,
    ]
  }

  cpu {
    cores = 2
    type  = "host"
  }

  memory {
    dedicated = 2048
    floating  = 2048
  }

  efi_disk {
    datastore_id = var.datastore_id
    type         = "4m"
  }

  network_device {
    bridge = "vmbr0"
  }

  disk {
    datastore_id = var.datastore_id
    interface    = "virtio0"
    iothread     = true
    import_from  = proxmox_download_file.ubuntu_2404.id
    size         = 15
  }

  initialization {
    datastore_id = var.datastore_id
    ip_config {
      ipv4 {
        address = "dhcp"
      }
    }
  }
}
```

The naming trap: the bpg provider ships a `proxmox_vm` resource. It's experimental, half-built, and doesn't support `disk`, `memory`, `initialization`, or `agent` blocks. Use it by accident and Terraform plans and applies without complaint. Then you wonder why your VM has no disk. Use `proxmox_virtual_environment_vm`, the long name.

The template is generic by design. No role-specific packages, no users baked in, no SSH keys. Everything gets injected at clone time via cloud-init. That keeps the template reusable: a different `initialization` block on the clone is all you need to specialize it.

## Task 5: Validation VM

```hcl
resource "proxmox_virtual_environment_vm" "validation" {
  node_name = var.vm_node_name
  name      = "tf-validation"
  agent { enabled = true }

  clone {
    vm_id = proxmox_virtual_environment_vm.ubuntu_template.vm_id
    full  = true
  }

  cpu { cores = 2 }
  memory { dedicated = 2048 }

  initialization {
    datastore_id = "local-lvm"
    ip_config {
      ipv4 {
        address = "dhcp"
      }
    }
    user_data_file_id = "local:snippets/tailscale.yaml"
  }
}
```

**`full = true`:** Linked clones share the template's disk. Full clones get an independent copy. For a throwaway validation VM the difference is small, but full clones destroy cleanly without touching the template.

**`user_data_file_id` only, no `user_account` block:** The `user_data_file_id` points at the snippet, which provides the entire cloud-init user-data. Add a `user_account` block on top and bpg generates a second user-data config. The two conflict. The symptom is cloud-init failing silently, which means no Tailscale and no guest agent, back to the 15-minute timeout.

**`agent { enabled = true }` and the patience it demands:** With this block, `terraform apply` waits for the QEMU guest agent to report an IP. The VM has to boot, cloud-init has to run, Tailscale has to install and come up, and the guest agent has to start. On first boot this takes 1-2 minutes. It's not a hang. It looks like one.

**Debugging with `qm cloudinit dump`:** Don't bother. `qm cloudinit dump <vmid> user` always shows Proxmox's auto-generated cloud-init config. It ignores `cicustom` entirely. The command inspects what Proxmox would generate, not what you configured. To verify your snippet is wired up, run `qm config <vmid> | grep cicustom`. If that line shows `local:snippets/tailscale.yaml`, you're good.

## Tests

I use the native `terraform test` framework (requires 1.7+) with mock providers, so tests run without touching real Proxmox:

```hcl
# tests/vm-validation.tftest.hcl
mock_provider "proxmox" {
  mock_resource "proxmox_virtual_environment_vm" {
    defaults = {
      vm_id = 100
    }
  }
  mock_resource "proxmox_download_file" {
    defaults = {
      id = "local:import/noble-server-cloudimg-amd64.qcow2"
    }
  }
}

run "validation_vm_exists" {
  command = apply

  assert {
    condition     = proxmox_virtual_environment_vm.validation.name == "tf-validation"
    error_message = "validation VM name mismatch"
  }
}
```

The mock provider still runs provider-level validators. Computed values like `proxmox_download_file.id` need realistic values pinned in `mock_resource { defaults }`. A zero-value ID fails validation, because the bpg provider validates the format of resource references.

## The debugging loop I'd rather forget

The cycle I ran more than once:

1. Edit the cloud-init snippet.
2. `terraform apply`. VM boots. Tailscale doesn't join.
3. Remember that `cloud-init runcmd` runs once per instance. Editing the snippet does nothing to an already-booted VM.
4. `terraform destroy -target=proxmox_virtual_environment_vm.validation`.
5. Paste the real authkey into `/var/lib/vz/snippets/tailscale.yaml`.
6. `terraform apply`.

The `-target` flag on destroy matters. A plain `terraform destroy` nukes everything: the image download, the template, the VM. Re-downloading the cloud image takes a few minutes. Rebuilding the template takes another minute. Use `-target` to drop only the VM you're iterating on.

## Verification

After getting the snippet right:

```
$ terraform apply
...
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.

$ ssh ubuntu@tf-validation
Welcome to Ubuntu 24.04.2 LTS (GNU/Linux 6.8.0-51-generic x86_64)
```

That's the success criterion. It passed.

## What I'd tell myself at the start

The MTU fix carries over from [Part 1](https://devops.lucasluize.com/post.html?slug=tailscale-wsl2-mtu-ssh-hang-debugging): cap `tailscaled` at `TS_DEBUG_MTU=1080` and set `tcp_mtu_probing=1` on the sending side. What's new here is how the failure hides. Half-succeeded applies and stalled cloud-init downloads all read as random flakiness until you connect them to packet size.

The other thing worth internalizing: when cloud-init fails silently, the debugging surface is `journalctl -u cloud-final` on the VM and `qm config <vmid> | grep cicustom` from the Proxmox host. Not `qm cloudinit dump`. Not the Terraform output. Those two commands tell you what actually happened.

Next up: drilling the `apply → verify → destroy` loop to idempotency. The question I'm sitting with: when the snippet is out-of-band and the authkey substitution is manual, where does the real source of truth live? Terraform state tracks the VM, but not the secret that made it useful. That's a gap I need to think through before this setup graduates from "homelab experiment" to something I'd trust for anything important.
