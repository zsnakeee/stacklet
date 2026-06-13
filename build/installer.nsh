; Custom NSIS additions for Stacklet.
;
; Adds a "Data directory" page right after the install-location page so the user
; can choose where Stacklet stores its DATA (certificates, logs, bundled
; services, projects) — separate from the program files. The chosen path is
; written to "$INSTDIR\datadir.txt", which the app reads on launch
; (see src/shared/paths.ts -> resolveOverride()).

; electron-builder includes this file before its own LogicLib/nsDialogs includes,
; so pull them in here (they're include-guarded — re-inclusion later is a no-op)
; to make ${If}, ${NSD_*} etc. available to the functions below.
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; Installer-only state (the uninstaller never touches the data dir). Declaring
; these in the uninstaller pass triggers NSIS warning 6001 (unused variable),
; which electron-builder treats as fatal — so guard them.
!ifndef BUILD_UNINSTALLER
Var StackletDataDir
Var StackletDataDirField
!endif

; Default the suggestion to the per-user app-data folder.
!macro customInit
  StrCpy $StackletDataDir "$LOCALAPPDATA\stacklet"
!macroend

; Inserted into the page flow after the directory page.
!macro customPageAfterChangeDir
  Page custom StackletDataDirPageCreate StackletDataDirPageLeave
!macroend

; These page functions exist only in the installer — the uninstaller has no
; install pages, so guard them out to avoid NSIS warning 6010 (unreferenced
; function), which electron-builder treats as a fatal error.
!ifndef BUILD_UNINSTALLER
Function StackletDataDirPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 34u "Stacklet keeps its certificates, logs, bundled services and projects here. This is separate from the program files. Keep the default, or pick another drive/folder (e.g. F:\Stacklet)."
  Pop $1

  ${NSD_CreateText} 0 44u 78% 13u "$StackletDataDir"
  Pop $StackletDataDirField

  ${NSD_CreateButton} 80% 43u 20% 15u "Browse…"
  Pop $2
  ${NSD_OnClick} $2 StackletDataDirBrowse

  nsDialogs::Show
FunctionEnd

Function StackletDataDirBrowse
  nsDialogs::SelectFolderDialog "Select the Stacklet data directory" "$StackletDataDir"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $StackletDataDirField "$0"
  ${EndIf}
FunctionEnd

Function StackletDataDirPageLeave
  ${NSD_GetText} $StackletDataDirField $StackletDataDir
FunctionEnd
!endif

; Persist the chosen data directory for the app to read on first launch.
!macro customInstall
  ${If} $StackletDataDir != ""
    ClearErrors
    FileOpen $9 "$INSTDIR\datadir.txt" w
    ${IfNot} ${Errors}
      FileWrite $9 "$StackletDataDir"
      FileClose $9
    ${EndIf}
  ${EndIf}
!macroend
