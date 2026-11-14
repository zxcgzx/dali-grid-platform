@echo off
setlocal
cd /d "%~dp0releases\v051-platform-a"
set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"
"%PYTHON_EXE%" -u serve_demo.py %*
if errorlevel 1 (
  echo Platform A did not start. Check Python, NumPy, SciPy, or try --port 8767.
  pause
)
endlocal