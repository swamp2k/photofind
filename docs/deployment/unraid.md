# Unraid deployment

PhotoFind's container listens on port `3000`. Map the following paths in the
Unraid template (create the writable directories first and grant the container
user read/write access):

```text
/mnt/user/appdata/photofind/config  -> /config
/mnt/user/appdata/photofind/cache   -> /cache
/mnt/user/photos                    -> /photos   (read-only)
/mnt/user/photofind-inbox           -> /inbox
/mnt/user/photofind-exports         -> /exports
```

Open `http://<unraid-ip>:3000/` from a browser on the trusted LAN. Keep the
photos mapping read-only; PhotoFind never needs to write original media. The
config, cache, inbox and exports mappings must survive container replacement so
the SQLite database, thumbnails and exports persist across restart/update.

Milestone 1 is intended for a trusted LAN only. It has no authentication and
must not be published directly to the public internet. Cloudflare Access,
Tailscale and household authentication are later work. Scans are request-bound
in this milestone, so keep initial folders modest; durable background jobs are
planned for Milestone 2.

No Community Applications submission or template is required yet.
