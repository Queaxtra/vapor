<div align="center">
  <img src="https://cdn.fatih.live/vapor-logo.png" alt="Vapor" width="200">
</div>

# Vapor

Vapor is a CLI for managing Cloudflare Email Routing aliases on your own domains.

It does not host mailboxes or read email contents. It creates and manages Cloudflare forwarding rules so you can use addresses like `test@yourdomain.com` and route them to a real inbox you control.

## What Vapor Does

Vapor:

- Initializes Cloudflare Email Routing for a domain
- Stores your local configuration in `~/.vapor`
- Creates alias forwarding rules
- Updates alias destinations or enabled state
- Deletes aliases
- Shows domain and alias status
- Supports multiple domains in one local setup

## Requirements

You need:

- [Bun](https://bun.sh/)
- A domain using Cloudflare DNS
- A Cloudflare API token with the correct permissions
- A real destination inbox to receive forwarded mail

You do not need:

- SMTP access
- A mail server
- Manual `zone_id` or `account_id` lookup for normal usage

Vapor resolves Cloudflare zone and account identifiers automatically during setup.

## Installation

Run directly with `bunx`:

```bash
bunx @queaxtra/vapor init
```

After a global install, the binary name stays `vapor`:

```bash
bun install -g .
vapor init
```

## Cloudflare API Token

Create a custom API token in the Cloudflare dashboard:

- User token: `Cloudflare Dashboard -> My Profile -> API Tokens -> Create Token`
- Account token: `Cloudflare Dashboard -> Manage Account -> API Tokens -> Create Token`

Use a custom token scoped only to the account or zone you want Vapor to manage.

Recommended permissions:

- `Zone Read`
- `Zone Settings Read`
- `Zone Settings Write`
- `Email Routing Rules Write`
- `Email Routing Addresses Write`

Optional read permissions:

- `Email Routing Rules Read`
- `Email Routing Addresses Read`

Important notes:

- Cloudflare only shows the token secret once
- If you lose it, you must create a new token
- Global API keys are not supported by Vapor
- If secure OS-backed keychain storage is unavailable, set `VAPOR_CLOUDFLARE_TOKEN` before running Vapor

Official references:

- [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)

## First-Time Setup

Run:

```bash
vapor init
```

Vapor will ask for:

1. Your Cloudflare API token
2. One or more domains
3. A default destination inbox for each domain

During setup, Vapor will:

1. Resolve the Cloudflare zone and account for each domain
2. Check whether Email Routing is enabled
3. Show the DNS changes Cloudflare wants to apply if routing is not enabled yet
4. Store your local configuration securely

If the destination inbox has never been used with Cloudflare Email Routing before, Cloudflare sends a verification email. Until that address is verified, aliases using it remain in a pending state.

## Commands

Initialize or reinitialize local configuration:

```bash
vapor init
```

Add a new domain in direct mode:

```bash
vapor domain add example.com --to inbox@example.net
```

Add a new domain with the guided wizard:

```bash
vapor domain add
vapor domain add --interactive
```

Remove a domain from local configuration only:

```bash
vapor domain remove example.com
```

Remove a domain with guided selection and confirmation:

```bash
vapor domain remove
vapor domain remove --interactive
```

List configured domains:

```bash
vapor domain list
```

Create an alias in direct mode:

```bash
vapor create test@example.com
vapor create test@example.com --to custom@example.net
```

Create an alias with the wizard:

```bash
vapor create
vapor create --interactive
```

Update an alias in direct mode:

```bash
vapor update test@example.com --to next@example.net
vapor update test@example.com --disable
vapor update test@example.com --enable
```

Update an alias with guided selection:

```bash
vapor update
vapor update --interactive
```

Delete an alias:

```bash
vapor delete test@example.com
vapor delete test@example.com --prune-destination
```

Delete an alias with guided confirmation:

```bash
vapor delete
vapor delete --interactive
```

List aliases:

```bash
vapor list
vapor list example.com
```

Show status:

```bash
vapor status
vapor status example.com
vapor status test@example.com
```

Show help:

```bash
vapor -h
```

## Guided Mode

Mutation commands support both direct arguments and a guided flow.

Behavior rules:

- If required values are missing, Vapor prompts for them automatically
- `--interactive` forces the wizard even when arguments are already provided
- `create`, `update`, `delete`, `domain add`, and `domain remove` support guided mode
- `list`, `status`, and `domain list` stay non-interactive

Typical examples:

```bash
vapor create
vapor create --to inbox@example.net
vapor update
vapor delete
vapor domain add
vapor domain remove
```

Destructive guided operations always require confirmation:

- `vapor delete`
- `vapor delete --interactive`
- `vapor domain remove`
- `vapor domain remove --interactive`

## Local Storage and Security

Vapor stores local state in `~/.vapor`.

Security behavior:

- The Cloudflare token is never stored in the project directory
- On macOS, Vapor uses Keychain when available
- On systems without supported secure keychain storage, Vapor reads the token from `VAPOR_CLOUDFLARE_TOKEN`
- `~/.vapor` is created with private permissions
- Local files are written with restrictive file modes
- Interactive terminal labels are sanitized before rendering
- Forward destinations using the same managed domain are rejected to prevent self-forwarding loops

Typical files:

- `~/.vapor/config.json`

## Important Behavior

Vapor:

- Manages forwarding rules only
- Does not send mail
- Does not create inboxes
- Does not fetch messages from Cloudflare
- One alias rule forwards to one destination address
- Existing MX records may be affected when enabling Cloudflare Email Routing

## License

This project is licensed under the MIT License.

See [LICENSE](./LICENSE) for details.
