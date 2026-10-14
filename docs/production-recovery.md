# Production recovery status

## Verified snapshot

The timestamped snapshot is:

`D:\WM Apps\2026 Applications\WM_CareerConnect-backups\pre-recovery-20261014T041307Z`

Its `backup-manifest.json` records SHA-256 hashes for the copied IIS-root files,
the on-disk backend `dist` tree, and the PM2 ecosystem config. All 364 copied
files were re-read and verified against the manifest. The snapshot directory is
restricted to the current operator, SYSTEM, and local Administrators.

This snapshot was taken after the frontend and backend build outputs had already
been written into their configured paths. It preserves the current on-disk
state; it is not a pre-build copy of the previous release. In particular, the
PM2 process was started before the latest source commits, while its on-disk
`backend\dist` was rebuilt afterward. The snapshot therefore cannot establish
or restore the exact code currently loaded in PM2.

## Staged release

The reviewed release was built outside the IIS root and PM2 `dist` directory:

`D:\WM Apps\2026 Applications\WM_CareerConnect-backups\release-bfbe4aec37680b31933835ef3c06d0c419459450`

Its `release-manifest.json` contains file hashes and confirms that Admin and
Student entry points reference present assets. The release includes the current
`web.config` unchanged. No production release switch or PM2 restart was made.

## Deployment and rollback gate

Do not deploy or restart PM2 until an authorized operator has:

1. Confirmed the IIS physical root using an elevated read-only command:

   ```powershell
   & "$env:windir\System32\inetsrv\appcmd.exe" list site "WM-CareerConnect" /text:physicalPath
   ```

2. Confirmed an approved maintenance window and the organization's release
   procedure. No deployment/rollback procedure was found in this repository.
3. Archived the exact known-good backend release currently intended as the
   rollback target. The snapshot's backend `dist` is not confirmed to match the
   code already loaded by the running PM2 process.
4. Verified the destination, available disk space, permissions, and release
   hashes before any replacement.

If a future approved deployment requires restoring the **static files in this
snapshot**, first verify that the IIS physical root matches the recorded source
root, then overlay the snapshot without deleting files:

```powershell
robocopy "D:\WM Apps\2026 Applications\WM_CareerConnect-backups\pre-recovery-20261014T041307Z\iis-root" "<verified IIS physical root>" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
```

Do not use `/MIR` or delete unreferenced assets during recovery. This restores
the snapshot's recorded static files and routing config; it is not a rollback to
an earlier frontend release. Do not use the saved backend `dist` as a rollback
target or restart PM2 until the exact known-good backend artifact and approved
restart procedure are confirmed. No database changes are part of this recovery.
