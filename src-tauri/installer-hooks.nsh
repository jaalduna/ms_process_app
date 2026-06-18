; NSIS installer hooks for the bundled-mock build.
;
; The app bundles a `mock-server.exe` sidecar. Windows refuses to overwrite a
; running .exe, so an in-app update (or a manual reinstall) fails with
;   Error opening file for writing: ...\mock-server.exe
; if the sidecar is still alive when the installer runs. Kill it before any
; files are written (install) or removed (the update's uninstall step) so the
; update always applies cleanly. /F = force, /IM = by image name. The process
; may legitimately not be running, so the non-zero exit is ignored.

!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM mock-server.exe'
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /IM mock-server.exe'
  Pop $0
!macroend
