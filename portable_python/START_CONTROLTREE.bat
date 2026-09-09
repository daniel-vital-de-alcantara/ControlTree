@echo off
setlocal
title ControlTree
cd /d "%~dp0"

echo ============================================================
echo  ControlTree - Python launcher
echo ============================================================
echo.
echo Checking for Python...

set "CONTROLTREE_PYTHON_EXE="
set "CONTROLTREE_PYTHON_ARGS="
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys" >nul 2>&1
    if not errorlevel 1 (
        set "CONTROLTREE_PYTHON_EXE=py"
        set "CONTROLTREE_PYTHON_ARGS=-3"
    )
)

if not defined CONTROLTREE_PYTHON_EXE (
    where py >nul 2>&1
    if not errorlevel 1 (
        py -c "import sys" >nul 2>&1
        if not errorlevel 1 set "CONTROLTREE_PYTHON_EXE=py"
    )
)

if not defined CONTROLTREE_PYTHON_EXE (
    where python >nul 2>&1
    if not errorlevel 1 (
        python -c "import sys" >nul 2>&1
        if not errorlevel 1 set "CONTROLTREE_PYTHON_EXE=python"
    )
)

if not defined CONTROLTREE_PYTHON_EXE (
    where python3 >nul 2>&1
    if not errorlevel 1 (
        python3 -c "import sys" >nul 2>&1
        if not errorlevel 1 set "CONTROLTREE_PYTHON_EXE=python3"
    )
)

if not defined CONTROLTREE_PYTHON_EXE goto :python_missing

for /f "delims=" %%V in ('%CONTROLTREE_PYTHON_EXE% %CONTROLTREE_PYTHON_ARGS% -c "import sys; print(sys.version.split()[0])"') do set "CONTROLTREE_PYTHON_VERSION=%%V"
echo Found Python %CONTROLTREE_PYTHON_VERSION%.
echo No packages, administrator access, or internet connection are required.
echo.
echo Starting ControlTree...
echo Your browser should open automatically in a few seconds.
echo.

%CONTROLTREE_PYTHON_EXE% %CONTROLTREE_PYTHON_ARGS% "%~dp0controltree_server.py"
set "CONTROLTREE_EXIT=%ERRORLEVEL%"

if not "%CONTROLTREE_EXIT%"=="0" (
    echo.
    echo ControlTree stopped because of an error.
    echo If the message above does not explain the problem, please report it at:
    echo https://github.com/daniel-vital-de-alcantara/ControlTree/issues
    echo.
    pause
    exit /b %CONTROLTREE_EXIT%
)

echo.
echo ControlTree has stopped.
pause
exit /b 0

:python_missing
echo.
echo ERROR: A compatible Python installation was not found.
echo.
echo Install 64-bit Python 3.10 or newer, then run this file again.
echo During Python installation, select "Add Python to PATH" if that option appears.
echo Download Python from: https://www.python.org/downloads/windows/
echo.
pause
exit /b 1
