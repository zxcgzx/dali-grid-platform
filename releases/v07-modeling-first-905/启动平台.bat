@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"
"%PYTHON_EXE%" -u server.py --port 8770 %*
if errorlevel 1 (
  echo Platform A did not start. Check Python or use --port 8771.
  pause
)
endlocal
