; maestro ai apps share one company folder
; included before the template defines PRODUCTNAME
!define COMPANY_DIR "$LOCALAPPDATA\MaestroAI-Company\Opera"
!define OLD_DEFAULT_DIR "$LOCALAPPDATA\Opera"

; shown in the folder page, the user can still pick another
!define MUI_CUSTOMFUNCTION_GUIINIT OperaCompanyFolder
Function OperaCompanyFolder
  StrCmp $INSTDIR "${OLD_DEFAULT_DIR}" 0 +2
    StrCpy $INSTDIR "${COMPANY_DIR}"
FunctionEnd

; silent installs skip the gui init
!macro NSIS_HOOK_PREINSTALL
  StrCmp $INSTDIR "${OLD_DEFAULT_DIR}" 0 +2
    StrCpy $INSTDIR "${COMPANY_DIR}"
!macroend

; an older install in the old default folder goes away
!macro NSIS_HOOK_POSTINSTALL
  StrCmp $INSTDIR "${OLD_DEFAULT_DIR}" done 0
  IfFileExists "${OLD_DEFAULT_DIR}\uninstall.exe" 0 done
    RMDir /r "${OLD_DEFAULT_DIR}"
  done:
!macroend
