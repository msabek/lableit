@echo off
setlocal enabledelayedexpansion
title Lableit Vision Labeling Platform
color 0B
set "DOCKER_COMPOSE_CMD=docker compose"
set "NONINTERACTIVE="
set "SKIP_PREREQS="
set "SCRIPT_ERROR="
set "VERBOSE_LOG=1"
set "PRISMA_VER=5.19.1"
if not "%~1"=="" set "NONINTERACTIVE=1"

REM Performance: Skip prerequisite checks if services already running
if "%~1"=="1" (
    docker info >nul 2>&1
    if !errorlevel! equ 0 set "SKIP_PREREQS=1"
)

echo.
echo  ========================================================
echo  ^|                                                      ^|
echo  ^|     LABLEIT - Vision Labeling Platform               ^|
echo  ^|     SAM-family Model Auto-Annotation System          ^|
echo  ^|                                                      ^|
echo  ========================================================
echo.

set "choice="
if not "%~1"=="" (
    set "choice=%~1"
    goto HANDLE_CHOICE
)

:MENU
if defined NONINTERACTIVE goto HANDLE_CHOICE
set "choice="
echo  Select an option:
echo.
echo  [1] Start All Services (Full Stack)
echo  [2] Start Infrastructure Only (Docker)
echo  [3] Start API Only
echo  [4] Start Web Frontend Only
echo  [5] Start Inference Service Only
echo  [6] Run Database Migrations
echo  [7] Install/Update Dependencies
echo  [8] Stop All Services
echo  [9] View Logs
echo  [G] Install/Upgrade GPU Support (PyTorch CUDA)
echo  [F] Install FFmpeg (for video slicing)
echo  [Q] Quick Restart (apps only, keeps infra)
echo  [0] Exit
echo.
set /p choice="Enter your choice (0-9, G, F, Q): "
if errorlevel 1 (
    echo No input detected. Exiting without closing this window.
    pause
    goto END
)
if "%choice%"=="" (
    echo No choice entered. Exiting without closing this window.
    pause
    goto END
)
goto HANDLE_CHOICE

:HANDLE_CHOICE
if "%choice%"=="1" goto START_ALL
if "%choice%"=="2" goto START_INFRA
if "%choice%"=="3" goto START_API
if "%choice%"=="4" goto START_WEB
if "%choice%"=="5" goto START_INFERENCE
if "%choice%"=="6" goto RUN_MIGRATIONS
if "%choice%"=="7" goto INSTALL_DEPS
if "%choice%"=="8" goto STOP_ALL
if "%choice%"=="9" goto VIEW_LOGS
if /i "%choice%"=="G" goto INSTALL_GPU
if /i "%choice%"=="F" goto INSTALL_FFMPEG
if /i "%choice%"=="Q" goto QUICK_RESTART
if "%choice%"=="0" goto EXIT

echo Invalid choice. Please try again.
if "%~1"=="" goto MENU
pause
goto END

:CHECK_PREREQS
echo.
echo Checking prerequisites...
echo.
set "PREREQ_FAIL="

REM Check if Docker CLI exists
docker --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [X] Docker is not installed.
    echo     Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    set PREREQ_FAIL=1
) else (
    echo [OK] Docker CLI found
)

REM Verify Docker daemon is running (catches stopped Docker Desktop/WSL backend)
if not defined PREREQ_FAIL (
    call :ENSURE_DOCKER_DAEMON
)

REM Locate Docker Compose (v2 plugin preferred, v1 fallback)
if not defined PREREQ_FAIL (
    set "DOCKER_COMPOSE_CMD=docker compose"
    %DOCKER_COMPOSE_CMD% version >nul 2>&1
    if !errorlevel! neq 0 (
        set "DOCKER_COMPOSE_CMD=docker-compose"
        %DOCKER_COMPOSE_CMD% version >nul 2>&1
    )
    if !errorlevel! neq 0 (
        echo [X] Docker Compose not found. Install/upgrade Docker Desktop to get the Compose plugin.
        set PREREQ_FAIL=1
    ) else (
        echo [OK] Docker Compose found: %DOCKER_COMPOSE_CMD%
    )
)

REM Check if Bun is installed
bun --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [X] Bun is not installed.
    echo     Please install Bun from https://bun.sh
    set PREREQ_FAIL=1
) else (
    echo [OK] Bun found
)

REM Check if Python is installed
python --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [X] Python is not installed.
    echo     Please install Python 3.10+ from https://python.org
    set PREREQ_FAIL=1
) else (
    echo [OK] Python found
)
echo [INFO] Skipping uv version check in this script; run "uv --version" manually if needed.

REM Check if FFmpeg is installed (required for video slicing)
set "FFMPEG_FOUND="
where ffmpeg >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] FFmpeg found
    set "FFMPEG_FOUND=1"
) else (
    REM Check common installation paths
    if exist "C:\ffmpeg\bin\ffmpeg.exe" (
        echo [OK] FFmpeg found at C:\ffmpeg\bin
        set "FFMPEG_FOUND=1"
        set "FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe"
    ) else if exist "%ProgramFiles%\ffmpeg\bin\ffmpeg.exe" (
        echo [OK] FFmpeg found at %ProgramFiles%\ffmpeg\bin
        set "FFMPEG_FOUND=1"
        set "FFMPEG_PATH=%ProgramFiles%\ffmpeg\bin\ffmpeg.exe"
    ) else if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg*\bin\ffmpeg.exe" (
        echo [OK] FFmpeg found via winget
        set "FFMPEG_FOUND=1"
    )
)

if not defined FFMPEG_FOUND (
    echo [!] FFmpeg not found ^(optional but required for video slicing^)
    echo     Video slicing feature will not work without FFmpeg.
    echo     Install FFmpeg using one of these methods:
    echo       - winget install Gyan.FFmpeg
    echo       - choco install ffmpeg
    echo       - Download from https://ffmpeg.org/download.html
    echo     After installation, add FFmpeg to your PATH or set FFMPEG_PATH env variable.
    REM Don't fail - FFmpeg is optional for basic functionality
)

if defined PREREQ_FAIL (
    echo.
    echo Some prerequisites are missing. Please install them and try again.
    pause
    goto MENU
)

echo.
echo All prerequisites found!
goto :EOF

:ENSURE_DOCKER_DAEMON
docker info >nul 2>&1
if not errorlevel 1 goto DOCKER_OK

echo [X] Docker daemon is not running.
set "DOCKER_DESKTOP_EXE="
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_DESKTOP_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else (
    if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
        set "DOCKER_DESKTOP_EXE=%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
    )
)

if defined DOCKER_DESKTOP_EXE (
    echo     Attempting to start Docker Desktop...
    start "" "%DOCKER_DESKTOP_EXE%" >nul 2>&1
) else (
    echo     Please start Docker Desktop ^(or your Linux/WSL Docker daemon^) and retry.
)

echo     Waiting for Docker daemon to become ready (up to 60s)...
for /L %%i in (1,1,12) do (
    ping -n 6 127.0.0.1 >nul
    docker info >nul 2>&1
    if not errorlevel 1 goto DOCKER_OK
)

echo [X] Docker daemon still unavailable. Start Docker Desktop, ensure WSL is running, then rerun.
set PREREQ_FAIL=1
goto :EOF

:DOCKER_OK
echo [OK] Docker daemon running
goto :EOF

REM ================================
REM Health Check Utility Functions
REM ================================

:CHECK_POSTGRES
REM Check if PostgreSQL is accepting connections (port 5433)
powershell -Command "try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('localhost', 5433); $tcp.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if !errorlevel! equ 0 (
    set "POSTGRES_READY=1"
) else (
    set "POSTGRES_READY="
)
goto :EOF

:CHECK_REDIS
REM Check if Redis is accepting connections (port 6380)
powershell -Command "try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('localhost', 6380); $tcp.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if !errorlevel! equ 0 (
    set "REDIS_READY=1"
) else (
    set "REDIS_READY="
)
goto :EOF

:CHECK_MINIO
REM Check if MinIO is accepting connections (port 9000)
powershell -Command "try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('localhost', 9000); $tcp.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if !errorlevel! equ 0 (
    set "MINIO_READY=1"
) else (
    set "MINIO_READY="
)
goto :EOF

:CHECK_API_HEALTH
REM Check API health endpoint using curl (available on Windows 10+)
REM Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues
curl -s -f -o nul --connect-timeout 2 "http://127.0.0.1:3001/health" >nul 2>&1
if !errorlevel! equ 0 (
    set "API_READY=1"
) else (
    set "API_READY="
)
goto :EOF

:CHECK_INFERENCE_HEALTH
REM Check Inference health endpoint using curl
curl -s -f -o nul --connect-timeout 2 "http://127.0.0.1:8001/health" >nul 2>&1
if !errorlevel! equ 0 (
    set "INFERENCE_READY=1"
) else (
    set "INFERENCE_READY="
)
goto :EOF

:CHECK_WEB_HEALTH
REM Check Web dev server (port 3000 - configured in vite.config.ts)
powershell -Command "try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('localhost', 3000); $tcp.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if !errorlevel! equ 0 (
    set "WEB_READY=1"
) else (
    set "WEB_READY="
)
goto :EOF

:WAIT_FOR_INFRA
REM Poll infrastructure services until ready (max 20 seconds)
set /a INFRA_WAIT=0
:INFRA_POLL_LOOP
call :CHECK_POSTGRES
call :CHECK_REDIS
call :CHECK_MINIO
if defined POSTGRES_READY if defined REDIS_READY if defined MINIO_READY (
    echo      All infrastructure services ready in %INFRA_WAIT%s
    goto :EOF
)
set /a INFRA_WAIT+=1
if %INFRA_WAIT% geq 20 (
    echo      Timeout waiting for infrastructure (20s)
    goto :EOF
)
ping -n 2 127.0.0.1 >nul
goto INFRA_POLL_LOOP

:START_INFRA
call :CHECK_PREREQS
echo.
echo Starting infrastructure services (PostgreSQL, Redis, MinIO)...
cd /d "%~dp0infra"
REM Use --wait flag to wait for healthchecks to pass
%DOCKER_COMPOSE_CMD% up -d --wait
if !errorlevel! neq 0 (
    echo WARNING: --wait flag may not be supported. Starting without it...
    %DOCKER_COMPOSE_CMD% up -d
    if !errorlevel! neq 0 (
        echo ERROR: Failed to start infrastructure services.
        pause
        goto MENU
    )
    echo.
    echo Waiting for services to be ready...
    call :WAIT_FOR_INFRA
) else (
    echo      Infrastructure services ready^!
)

echo.
echo Creating MinIO bucket if it doesn't exist...
%DOCKER_COMPOSE_CMD% exec -T minio mc alias set myminio http://localhost:9000 minioadmin minioadmin >nul 2>&1
%DOCKER_COMPOSE_CMD% exec -T minio mc mb myminio/lableit --ignore-existing >nul 2>&1

echo.
echo Infrastructure services are running:
echo   - PostgreSQL: localhost:5433
echo   - Redis:      localhost:6380
echo   - MinIO:      localhost:9000 (Console: http://localhost:9001)
echo.
cd /d "%~dp0"
if defined NONINTERACTIVE (
    pause
    goto END
)
pause
goto MENU

:INSTALL_DEPS
call :CHECK_PREREQS
echo.
echo Installing dependencies...
echo.

cd /d "%~dp0"

REM Create .env if it doesn't exist
if not exist .env (
    echo Creating .env file from template...
    copy .env.example .env
    echo.
    echo IMPORTANT: Edit .env file if you need custom configuration.
    echo Default values are configured for local development.
    echo.
)

echo [1/4] Installing Node.js dependencies ^(root workspace^)...
echo      Running: bun install
call bun install
if !errorlevel! neq 0 (
    echo WARNING: Some root dependencies may have failed to install.
)

echo.
echo [2/4] Installing API dependencies...
echo      Running: bun install in apps/api
cd /d "%~dp0apps\api"
call bun install
if !errorlevel! neq 0 (
    echo WARNING: API dependencies may have failed to install.
)

echo.
echo [3/4] Installing Python dependencies for inference service...
cd /d "%~dp0apps\inference"
REM Validate existing venv Python is functional (catches venvs from other machines/users)
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "print('ok')" >nul 2>&1
    if errorlevel 1 (
        echo      Venv Python is broken ^(wrong path or different machine^). Recreating...
        rmdir /s /q ".venv" >nul 2>&1
    )
)
REM Create virtual environment if it doesn't exist
if not exist ".venv\Scripts\activate.bat" (
    echo      Creating Python virtual environment...
    echo      Running: uv venv .venv
    uv venv .venv
    if errorlevel 1 (
        echo      UV failed, trying python -m venv...
        python -m venv .venv
    )
)

REM Check for NVIDIA GPU and install CUDA PyTorch
echo      Checking for NVIDIA GPU...
nvidia-smi >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] NVIDIA GPU detected - installing PyTorch with CUDA support
    echo      This may take a few minutes to download ~2.5GB...
    echo      Running: uv pip install torch torchvision torchaudio --index-url .../cu128
    uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 --python .venv\Scripts\python.exe
    if !errorlevel! neq 0 (
        echo      cu128 failed, trying cu126 fallback...
        uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126 --python .venv\Scripts\python.exe
    )
) else (
    echo [INFO] No NVIDIA GPU detected - installing CPU-only PyTorch
    echo      Running: uv pip install torch torchvision torchaudio
    uv pip install torch torchvision torchaudio --python .venv\Scripts\python.exe
)

echo.
echo [4/4] Installing remaining Python dependencies from requirements.txt...
echo      Running: uv pip install -r requirements.txt
REM Install remaining deps first, then enforce selected torch build after resolver runs
uv pip install -r requirements.txt --python .venv\Scripts\python.exe
if errorlevel 1 (
    echo      UV failed, trying pip fallback...
    .venv\Scripts\pip.exe install -r requirements.txt
    if errorlevel 1 (
        echo WARNING: Python dependencies may have failed to install.
    )
)

REM Re-assert torch backend after requirements install because sam3 dependency resolution
REM may replace CUDA wheels with CPU wheels on Windows.
echo.
echo      Re-validating PyTorch backend after dependency resolution...
nvidia-smi >nul 2>&1
if !errorlevel! equ 0 (
    uv pip install torch torchvision torchaudio --torch-backend=cu128 --python .venv\Scripts\python.exe >nul 2>&1
    if !errorlevel! neq 0 (
        uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 --python .venv\Scripts\python.exe >nul 2>&1
        if !errorlevel! neq 0 (
            uv pip install torch torchvision torchaudio --torch-backend=cu126 --python .venv\Scripts\python.exe >nul 2>&1
        )
    )
)

echo.
echo Generating Prisma client...
cd /d "%~dp0apps\api"
call bunx prisma@%PRISMA_VER% generate
if !errorlevel! neq 0 (
    echo WARNING: Prisma client generation may have failed.
)

echo.
echo Dependencies installed successfully^!
echo.
cd /d "%~dp0"
pause
goto MENU

:RUN_MIGRATIONS
echo.
echo Running database migrations...
echo.

cd /d "%~dp0apps\api"

echo Generating Prisma client...
call bunx prisma@%PRISMA_VER% generate
if !errorlevel! neq 0 (
    echo ERROR: Failed to generate Prisma client.
    pause
    goto MENU
)

echo.
echo Running migrations...
call bunx prisma@%PRISMA_VER% migrate dev --name auto
if !errorlevel! neq 0 (
    echo.
    echo Migration may have failed. Common issues:
    echo   - Database not running (start infrastructure first)
    echo   - Invalid DATABASE_URL in .env
    echo.
    echo Trying to push schema instead...
    call bunx prisma@%PRISMA_VER% db push
)

echo.
echo Database setup complete^!
cd /d "%~dp0"
pause
goto MENU

:START_API
echo.
echo Starting API server...
echo.
echo API will be available at: http://localhost:3001
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0apps\api"
call bun run dev
cd /d "%~dp0"
goto MENU

:START_WEB
echo.
echo Starting web frontend...
echo.
echo Web app will be available at: http://localhost:3000
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0apps\web"
call bun run dev
cd /d "%~dp0"
goto MENU

:START_INFERENCE
echo.
echo Starting inference service...
echo.
echo Inference service will be available at: http://localhost:8001
echo API docs at: http://localhost:8001/docs
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0apps\inference"
if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe -m uvicorn main:app --reload --reload-exclude ".venv" --host 0.0.0.0 --port 8001
) else (
    python -m uvicorn main:app --reload --reload-exclude ".venv" --host 0.0.0.0 --port 8001
)
cd /d "%~dp0"
goto MENU

:START_ALL
REM Fast path: skip full prereq check if Docker is running
if defined SKIP_PREREQS (
    echo [Fast mode] Skipping prerequisite checks...
) else (
    call :CHECK_PREREQS
)

echo.
echo ========================================
echo  Starting Lableit Full Stack
echo ========================================
echo.

REM Kill any existing processes to free ports (quick, no wait)
echo Cleaning up any existing processes...
taskkill /F /IM bun.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq *uvicorn*" >nul 2>&1
REM Kill any leftover processes on our ports (3000, 3001, 8001)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8001 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%p >nul 2>&1
ping -n 2 127.0.0.1 >nul

REM Check if .env exists
if not exist .env (
    echo No .env file found. Creating from template...
    copy .env.example .env
)

REM Start infrastructure with healthcheck wait
echo [1/5] Starting infrastructure services...
cd /d "%~dp0infra"
%DOCKER_COMPOSE_CMD% up -d --wait 2>&1
if !errorlevel! neq 0 (
    echo      Retrying without --wait flag...
    %DOCKER_COMPOSE_CMD% up -d 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Failed to start infrastructure services!
        echo         Is Docker Desktop running?
        set "SCRIPT_ERROR=1"
        goto ERROR_HANDLER
    )
    echo.
    echo [2/5] Waiting for infrastructure to be ready...
    call :WAIT_FOR_INFRA
) else (
    echo      Infrastructure ready^!
    echo.
    echo [2/5] Infrastructure health checks passed^!
)

REM Start MinIO bucket creation in background (non-blocking)
echo [3/5] Creating MinIO bucket in background...
start "LableitMinioSetup" /b cmd /c "cd /d %~dp0infra && %DOCKER_COMPOSE_CMD% exec -T minio mc alias set myminio http://localhost:9000 minioadmin minioadmin >nul 2>&1 && %DOCKER_COMPOSE_CMD% exec -T minio mc mb myminio/lableit --ignore-existing >nul 2>&1"

cd /d "%~dp0"

echo.
echo [4/5] Database setup (Prisma)...
cd /d "%~dp0apps\api"
set "DATABASE_URL=postgresql://lableit:lableit@localhost:5433/lableit"
REM Ensure node_modules exist before running Prisma
if not exist "node_modules" (
    echo      Installing API dependencies first...
    call bun install
)
REM Only regenerate if node_modules/.prisma doesn't exist
if not exist "node_modules\.prisma\client\index.js" (
    echo      Generating Prisma client...
    call bunx prisma@%PRISMA_VER% generate
    if errorlevel 1 (
        echo [ERROR] Prisma client generation failed^!
        echo         Make sure dependencies are installed: bun install
        set "SCRIPT_ERROR=1"
        goto ERROR_HANDLER
    )
) else (
    echo      Prisma client already generated
)
REM Run db push (faster than migrate dev for development)
echo      Syncing database schema...
call bunx prisma@%PRISMA_VER% db push --accept-data-loss
if errorlevel 1 (
    echo [WARNING] Database sync had issues. Continuing anyway...
)
cd /d "%~dp0"

echo.
echo [5/5] Starting application services...
echo.

REM Setup Python virtual environment for inference if needed
set "VENV_DIR=%~dp0apps\inference\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"

REM Validate venv Python is functional (catches venvs from other machines/users)
if exist "%VENV_PYTHON%" (
    "%VENV_PYTHON%" -c "print('ok')" >nul 2>&1
    if errorlevel 1 (
        echo      Venv Python is broken ^(wrong path or different machine^). Recreating...
        rmdir /s /q "%VENV_DIR%" >nul 2>&1
    )
)

if not exist "%VENV_ACTIVATE%" (
    echo      Creating Python virtual environment for inference...
    cd /d "%~dp0apps\inference"
    echo      Running: uv venv .venv
    uv venv .venv
    if errorlevel 1 (
        echo      UV failed, trying python -m venv...
        python -m venv .venv
    )
)

REM Check if PyTorch CUDA actually works with this GPU (not just is_available)
set "NEED_CUDA_TORCH="
nvidia-smi >nul 2>&1
if !errorlevel! equ 0 (
    echo      GPU detected:
    for /f "tokens=*" %%g in ('nvidia-smi --query-gpu^=name^,driver_version^,memory.total --format^=csv^,noheader 2^>nul') do echo        %%g
    echo.
    if exist "%VENV_PYTHON%" (
        REM Test real CUDA tensor creation - catches architecture mismatches like sm_120
        "%VENV_PYTHON%" -c "import torch; torch.zeros(1,device='cuda'^)" >nul 2>&1
        if !errorlevel! neq 0 set "NEED_CUDA_TORCH=1"
    ) else (
        set "NEED_CUDA_TORCH=1"
    )
)

if defined NEED_CUDA_TORCH (
    echo      NVIDIA GPU detected but PyTorch CUDA not working with this GPU^!
    echo      Reinstalling PyTorch with CUDA 12.8 support ^(required for RTX 50-series Blackwell^)...
    cd /d "%~dp0apps\inference"
    REM Must uninstall old torch first so uv downloads the correct build
    uv pip uninstall torch torchvision torchaudio --python .venv\Scripts\python.exe >nul 2>&1
    REM Use --torch-backend=cu128 (uv's native CUDA wheel resolver, more reliable than --index-url)
    uv pip install torch torchvision torchaudio --torch-backend=cu128 --python .venv\Scripts\python.exe
    if !errorlevel! neq 0 (
        echo      --torch-backend failed, trying --index-url fallback...
        uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 --python .venv\Scripts\python.exe
        if !errorlevel! neq 0 (
            echo      cu128 failed, trying cu126 fallback...
            uv pip install torch torchvision torchaudio --torch-backend=cu126 --python .venv\Scripts\python.exe
        )
    )
    REM Verify CUDA actually works after install
    echo      Verifying CUDA initialization...
    "%VENV_PYTHON%" -c "import torch; print(f'      PyTorch {torch.__version__}'); print(f'      CUDA available: {torch.cuda.is_available()}'); print(f'      CUDA arch list: {torch.cuda.get_arch_list()}'); assert torch.cuda.is_available(), 'CUDA init failed'" 2>&1
    if !errorlevel! neq 0 (
        echo      [WARNING] CUDA still not available after stable install.
        echo      Trying nightly build with CUDA 12.8 as last resort...
        uv pip uninstall torch torchvision torchaudio --python .venv\Scripts\python.exe >nul 2>&1
        uv pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128 --python .venv\Scripts\python.exe
        if !errorlevel! equ 0 (
            "%VENV_PYTHON%" -c "import torch; print(f'      PyTorch {torch.__version__}'); print(f'      CUDA available: {torch.cuda.is_available()}')" 2>&1
        )
    ) else (
        echo      [OK] CUDA verified successfully^!
    )
    REM Install SAM3 missing deps for Windows (not declared in sam3 package)
    echo      Installing SAM3 Windows dependencies...
    uv pip install triton-windows einops decord --python .venv\Scripts\python.exe >nul 2>&1
    REM Install SAM3 from GitHub (PyPI sam3==0.1.2 has broken package structure - missing sam3.sam submodule)
    echo      Installing SAM3 from GitHub ^(PyPI package is broken^)...
    uv pip install --upgrade --no-deps "sam3 @ git+https://github.com/facebookresearch/sam3.git@c97c893969003d3e6803fd5d679f21e515aef5ce" --python .venv\Scripts\python.exe
    if !errorlevel! neq 0 (
        echo      GitHub install failed, trying PyPI fallback...
        uv pip install --upgrade --no-deps "sam3>=0.1.2" --python .venv\Scripts\python.exe >nul 2>&1
    )
)

REM Check if uvicorn is installed
set "NEED_PY_DEPS="
if not exist "%VENV_PYTHON%" set "NEED_PY_DEPS=1"
if not defined NEED_PY_DEPS (
    "%VENV_PYTHON%" -c "import uvicorn" >nul 2>&1
    if !errorlevel! neq 0 set "NEED_PY_DEPS=1"
)

if defined NEED_PY_DEPS (
    echo      Installing Python dependencies from requirements.txt...
    cd /d "%~dp0apps\inference"
    echo      Running: uv pip install -r requirements.txt
    uv pip install -r requirements.txt --python .venv\Scripts\python.exe
    if !errorlevel! neq 0 (
        echo      UV failed, trying pip fallback...
        .venv\Scripts\pip.exe install -r requirements.txt
    )
)
cd /d "%~dp0"

REM ================================
REM SAM3 Model Setup
REM ================================
set "SAM3_MODEL_PATH=%~dp0apps\inference\models\facebook\sam3\sam3.pt"
set "MODEL_CONFIG_FILE=%~dp0apps\inference\model_config.json"
set "INFERENCE_DIR=%~dp0apps\inference"

REM Repair stale absolute paths in model_config.json (e.g. copied from older Lableit folders).
if exist "!MODEL_CONFIG_FILE!" (
    powershell -NoProfile -Command "$cfg='!MODEL_CONFIG_FILE!'; $inf='!INFERENCE_DIR!'; if(Test-Path $cfg){ $json=Get-Content $cfg -Raw ^| ConvertFrom-Json; $changed=$false; foreach($k in 'model_path','base_dir'){ $v=$json.$k; if($v){ $n=[System.IO.Path]::GetFullPath($v); if(-not (Test-Path $n)){ if($n -match 'apps[\\/]+inference[\\/]+(.+)$'){ $cand=Join-Path $inf $matches[1]; if(Test-Path $cand){ $json.$k=$cand; $changed=$true } } } } }; if($changed){ $json ^| ConvertTo-Json -Depth 8 ^| Set-Content $cfg -Encoding UTF8 } }" >nul 2>&1
)

REM Always ensure sam3 + modelscope packages are installed (fast if already ok)
echo.
echo [SAM3 Setup] Ensuring SAM3 dependencies...
REM Install SAM3 from GitHub (PyPI 0.1.2 has broken package - missing sam3.sam submodule)
uv pip install --upgrade --no-deps "sam3 @ git+https://github.com/facebookresearch/sam3.git@c97c893969003d3e6803fd5d679f21e515aef5ce" --python "%VENV_PYTHON%" >nul 2>&1
if !errorlevel! neq 0 uv pip install --upgrade --no-deps "sam3>=0.1.2" --python "%VENV_PYTHON%" >nul 2>&1
REM SAM3 Windows deps + model download deps
uv pip install triton-windows einops decord modelscope packaging requests --python "%VENV_PYTHON%" >nul 2>&1

REM Skip model download if model file already exists
if exist "!SAM3_MODEL_PATH!" (
    echo [SAM3] Model already downloaded. Skipping download.
    goto SKIP_SAM3_SETUP
)

echo.
echo [SAM3 Setup] Downloading model...
if not defined HF_TOKEN (
    if exist .env (
        for /f "tokens=1* delims==" %%a in ('type .env ^| findstr "HF_TOKEN"') do set "HF_TOKEN=%%b"
    )
)

echo      Running model downloader (ModelScope First)...
"%VENV_PYTHON%" "apps\inference\download_models.py"

if !errorlevel! neq 0 (
    echo [WARNING] Python downloader failed. Trying ModelScope CLI fallback...

    rem Try running module directly if exe is missing
    "%VENV_PYTHON%" -m modelscope download --model facebook/sam3

    if !errorlevel! neq 0 (
         echo [ERROR] Model download failed.
         echo Please manually run: modelscope download --model facebook/sam3
         pause
    ) else (
         echo [SUCCESS] Model downloaded via CLI.
    )
) else (
    echo [OK] Model is ready.
)

:SKIP_SAM3_SETUP

cd /d "%~dp0"

REM ================================
REM FFmpeg Check for Video Slicing
REM ================================
echo.
echo [FFmpeg] Checking for video slicing support...
set "FFMPEG_PATH="
where ffmpeg >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] FFmpeg found in PATH
    for /f "delims=" %%i in ('where ffmpeg') do set "FFMPEG_PATH=%%i"
) else (
    REM Check common installation paths
    if exist "C:\ffmpeg\bin\ffmpeg.exe" (
        set "FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe"
        echo [OK] FFmpeg found at C:\ffmpeg\bin
    ) else if exist "%ProgramFiles%\ffmpeg\bin\ffmpeg.exe" (
        set "FFMPEG_PATH=%ProgramFiles%\ffmpeg\bin\ffmpeg.exe"
        echo [OK] FFmpeg found at %ProgramFiles%\ffmpeg\bin
    ) else (
        REM Check winget installation path
        for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*") do (
            for /d %%E in ("%%D\ffmpeg*") do (
                if exist "%%E\bin\ffmpeg.exe" (
                    set "FFMPEG_PATH=%%E\bin\ffmpeg.exe"
                    echo [OK] FFmpeg found at %%E\bin
                )
            )
        )
    )
)

if not defined FFMPEG_PATH (
    echo [!] FFmpeg not found - attempting automatic installation...
    echo.
    
    REM Try winget first (Windows 10/11 built-in)
    winget --version >nul 2>&1
    if !errorlevel! equ 0 (
        echo      Installing FFmpeg via winget...
        echo      Running: winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
        winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
        if !errorlevel! equ 0 (
            echo [OK] FFmpeg installed successfully!
            REM Try to find the installed path
            for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*") do (
                for /d %%E in ("%%D\ffmpeg*") do (
                    if exist "%%E\bin\ffmpeg.exe" (
                        set "FFMPEG_PATH=%%E\bin\ffmpeg.exe"
                    )
                )
            )
        ) else (
            echo      winget installation failed.
        )
    )
    
    REM If still not found, try chocolatey
    if not defined FFMPEG_PATH (
        choco --version >nul 2>&1
        if !errorlevel! equ 0 (
            echo      Installing FFmpeg via Chocolatey...
            choco install ffmpeg -y
            if !errorlevel! equ 0 (
                echo [OK] FFmpeg installed via Chocolatey!
                where ffmpeg >nul 2>&1
                if !errorlevel! equ 0 (
                    for /f "delims=" %%i in ('where ffmpeg') do set "FFMPEG_PATH=%%i"
                )
            )
        )
    )
    
    REM Final check
    if not defined FFMPEG_PATH (
        echo [!] FFmpeg could not be installed automatically.
        echo     Video slicing will not work until FFmpeg is installed.
        echo     Manual installation options:
        echo       - winget install Gyan.FFmpeg
        echo       - choco install ffmpeg
        echo       - Download from https://ffmpeg.org/download.html
        echo     After installing, restart run.bat.
    )
) else (
    echo     Path: %FFMPEG_PATH%
)

REM Start all services in parallel
echo.
echo ========================================
echo  Starting Application Services
echo ========================================
echo.
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "LAUNCH_TIME=%%a:%%b:%%c"

REM Start API in background (pass FFMPEG_PATH if found)
echo [!LAUNCH_TIME!] [STARTING] API Server ^(Bun + Fastify^)
echo               Port: 3001
echo               Path: apps\api
if defined FFMPEG_PATH (
    echo               FFmpeg: Enabled ^(%FFMPEG_PATH%^)
    start "LableitAPI" /b cmd /c "set FFMPEG_PATH=%FFMPEG_PATH% && cd /d %~dp0apps\api && bun run dev"
) else (
    echo               FFmpeg: Not found ^(video slicing disabled^)
    start "LableitAPI" /b cmd /c "cd /d %~dp0apps\api && bun run dev"
)
echo.

REM Start Inference in background using venv
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "INF_TIME=%%a:%%b:%%c"
echo [!INF_TIME!] [STARTING] Inference Service ^(FastAPI + SAM3^)
echo               Port: 8001
echo               Path: apps\inference
if exist "%VENV_PYTHON%" (
    echo               Python: Using virtual environment
    start "LableitInference" /b cmd /c "cd /d %~dp0apps\inference && .venv\Scripts\python.exe -m uvicorn main:app --reload --reload-exclude .venv --host 0.0.0.0 --port 8001"
) else (
    echo               Python: Using system Python ^(venv not found^)
    start "LableitInference" /b cmd /c "cd /d %~dp0apps\inference && python -m uvicorn main:app --reload --reload-exclude .venv --host 0.0.0.0 --port 8001"
)
echo.

REM Start Web in parallel (no need to wait for backend for dev server)
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "WEB_TIME=%%a:%%b:%%c"
echo [!WEB_TIME!] [STARTING] Web Frontend ^(Vite + React^)
echo               Port: 3000
echo               Path: apps\web
start "LableitWeb" /b cmd /c "cd /d %~dp0apps\web && bun run dev"
echo.

REM Small delay to let processes initialize
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "WAIT_TIME=%%a:%%b:%%c"
echo [!WAIT_TIME!] All processes launched. Waiting for services to initialize...
ping -n 2 127.0.0.1 >nul

REM Poll for services to be ready (with visual feedback)
echo.
echo ========================================
echo  Service Health Monitor
echo ========================================
echo.
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "START_TIME=%%a:%%b:%%c"
echo [%START_TIME%] Starting service health checks...
echo.
echo      Checking ports:
echo        - API Server:       http://127.0.0.1:3001/health
echo        - Inference:        http://127.0.0.1:8001/health
echo        - Web Frontend:     http://127.0.0.1:3000
echo.
set /a SVC_WAIT=0
set "API_FIRST_READY="
set "INFERENCE_FIRST_READY="
set "WEB_FIRST_READY="

:SVC_POLL_LOOP
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "CURRENT_TIME=%%a:%%b:%%c"
call :CHECK_API_HEALTH
call :CHECK_INFERENCE_HEALTH
call :CHECK_WEB_HEALTH

set "READY_COUNT=0"
set "STATUS_LINE=[%CURRENT_TIME%] "

REM API Status with first-ready detection
if defined API_READY (
    set /a READY_COUNT+=1
    if not defined API_FIRST_READY (
        set "API_FIRST_READY=1"
        echo [%CURRENT_TIME%] [EVENT] API Server is now ONLINE at :3001
    )
    set "STATUS_LINE=!STATUS_LINE!API[ONLINE] "
) else (
    set "STATUS_LINE=!STATUS_LINE!API[waiting...] "
)

REM Inference Status with first-ready detection
if defined INFERENCE_READY (
    set /a READY_COUNT+=1
    if not defined INFERENCE_FIRST_READY (
        set "INFERENCE_FIRST_READY=1"
        echo [%CURRENT_TIME%] [EVENT] Inference Service is now ONLINE at :8001
    )
    set "STATUS_LINE=!STATUS_LINE!Inference[ONLINE] "
) else (
    set "STATUS_LINE=!STATUS_LINE!Inference[waiting...] "
)

REM Web Status with first-ready detection
if defined WEB_READY (
    set /a READY_COUNT+=1
    if not defined WEB_FIRST_READY (
        set "WEB_FIRST_READY=1"
        echo [%CURRENT_TIME%] [EVENT] Web Frontend is now ONLINE at :3000
    )
    set "STATUS_LINE=!STATUS_LINE!Web[ONLINE] "
) else (
    set "STATUS_LINE=!STATUS_LINE!Web[waiting...] "
)

echo !STATUS_LINE! ^| !READY_COUNT!/3 services ^| %SVC_WAIT%s elapsed

if %READY_COUNT% equ 3 (
    echo.
    for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "END_TIME=%%a:%%b:%%c"
    echo [!END_TIME!] [SUCCESS] All services ready in %SVC_WAIT% seconds!
    echo.
    goto SVC_READY
)

set /a SVC_WAIT+=1
if %SVC_WAIT% geq 45 (
    echo.
    for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "FAIL_TIME=%%a:%%b:%%c"
    echo [!FAIL_TIME!] [WARNING] Timeout after 45s: %READY_COUNT%/3 services ready
    echo.
    echo ========================================
    echo  Diagnostic Information
    echo ========================================
    echo.

    REM Detailed diagnostic for each service
    if not defined API_READY (
        echo [ISSUE] API Server ^(:3001^) - NOT RESPONDING
        echo         Possible causes:
        echo           - Port 3001 may be in use by another application
        echo           - Database connection failed
        echo           - Missing environment variables
        echo         Try: Check apps/api for error output
        echo.
        netstat -ano | findstr ":3001" >nul 2>&1
        if !errorlevel! equ 0 (
            echo         [DEBUG] Port 3001 IS in use:
            netstat -ano | findstr ":3001"
        ) else (
            echo         [DEBUG] Port 3001 is NOT bound - API process may have crashed
        )
        echo.
    )

    if not defined INFERENCE_READY (
        echo [ISSUE] Inference Service ^(:8001^) - NOT RESPONDING
        echo         Possible causes:
        echo           - Python virtual environment not activated
        echo           - Missing Python dependencies
        echo           - SAM3 model not downloaded
        echo           - GPU/CUDA issues
        echo         Try: Check apps/inference for error output
        echo.
        netstat -ano | findstr ":8001" >nul 2>&1
        if !errorlevel! equ 0 (
            echo         [DEBUG] Port 8001 IS in use:
            netstat -ano | findstr ":8001"
        ) else (
            echo         [DEBUG] Port 8001 is NOT bound - Inference process may have crashed
        )
        echo.
    )

    if not defined WEB_READY (
        echo [ISSUE] Web Frontend ^(:3000^) - NOT RESPONDING
        echo         Possible causes:
        echo           - Port 3000 may be in use
        echo           - Vite dev server failed to start
        echo           - Missing node_modules
        echo         Try: Run 'bun install' in apps/web
        echo.
        netstat -ano | findstr ":3000" >nul 2>&1
        if !errorlevel! equ 0 (
            echo         [DEBUG] Port 3000 IS in use:
            netstat -ano | findstr ":3000"
        ) else (
            echo         [DEBUG] Port 3000 is NOT bound - Web process may have crashed
        )
        echo.
    )

    echo ========================================
    echo.
    if %READY_COUNT% equ 0 (
        echo [ERROR] No services started! There may be a configuration issue.
        echo        Please check the output above for specific errors.
        echo.
        pause
    )
    goto SVC_READY
)
ping -n 2 127.0.0.1 >nul
goto SVC_POLL_LOOP

:SVC_READY
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set "READY_TIME=%%a:%%b:%%c"
echo.
echo ========================================
echo  Lableit is Ready!
echo ========================================
echo.
echo  [%READY_TIME%] System Status: OPERATIONAL
echo.
echo  +------------------------------------------+
echo  ^|  Service          ^|  Status   ^|  URL     ^|
echo  +------------------------------------------+
if defined API_READY (
    echo  ^|  API Server       ^|  ONLINE   ^|  :3001   ^|
) else (
    echo  ^|  API Server       ^|  OFFLINE  ^|  :3001   ^|
)
if defined INFERENCE_READY (
    echo  ^|  Inference        ^|  ONLINE   ^|  :8001   ^|
) else (
    echo  ^|  Inference        ^|  OFFLINE  ^|  :8001   ^|
)
if defined WEB_READY (
    echo  ^|  Web Frontend     ^|  ONLINE   ^|  :3000   ^|
) else (
    echo  ^|  Web Frontend     ^|  OFFLINE  ^|  :3000   ^|
)
echo  +------------------------------------------+
echo.
echo  Quick Links:
echo    - Web Application:    http://localhost:3000
echo    - API Health Check:   http://localhost:3001/health
echo    - API Docs ^(Swagger^): http://localhost:8001/docs
echo    - MinIO Console:      http://localhost:9001
echo.
echo  Infrastructure:
echo    - PostgreSQL:   localhost:5433
echo    - Redis:        localhost:6380
echo    - MinIO:        localhost:9000 ^(Console: 9001^)
echo.
echo  MinIO Credentials: minioadmin / minioadmin
echo.
echo  ----------------------------------------
echo  ^| NOTE: If you see "Cannot connect to   ^|
echo  ^| server" in the browser, the API may   ^|
echo  ^| still be initializing. Wait a few     ^|
echo  ^| seconds and refresh the page.         ^|
echo  ----------------------------------------
echo.
echo  Services are running in the background.
echo  Press Ctrl+C to stop all services.
echo.
if defined NONINTERACTIVE (
    echo [%READY_TIME%] Services started. Press Ctrl+C to stop, or close this window.
)

REM Keep the window open and prevent any accidental exits
:FOREVER
ping -n 60 127.0.0.1 >nul
if errorlevel 1 goto FOREVER
goto FOREVER

:QUICK_RESTART
echo.
echo ========================================
echo  Quick Restart (Apps Only)
echo ========================================
echo.

REM Check infrastructure is running
call :CHECK_POSTGRES
call :CHECK_REDIS
if not defined POSTGRES_READY (
    echo ERROR: Infrastructure not running. Use option [1] for full start.
    pause
    goto MENU
)

REM Kill application processes only
echo Stopping application processes...
taskkill /F /IM bun.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq *uvicorn*" >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo Starting application services...
cd /d "%~dp0"

REM Setup venv path
set "VENV_DIR=%~dp0apps\inference\.venv"

REM Start all services in parallel
start "" /b cmd /c "cd /d %~dp0apps\api && bun run dev"

if exist "%VENV_DIR%\Scripts\python.exe" (
    start "" /b cmd /c "cd /d %~dp0apps\inference && .venv\Scripts\python.exe -m uvicorn main:app --reload --reload-exclude .venv --host 0.0.0.0 --port 8001 <nul"
) else (
    start "" /b cmd /c "cd /d %~dp0apps\inference && python -m uvicorn main:app --reload --reload-exclude .venv --host 0.0.0.0 --port 8001 <nul"
)

start "" /b cmd /c "cd /d %~dp0apps\web && bun run dev <nul"

REM Quick poll for services
echo Waiting for services...
set /a Q_WAIT=0
:Q_POLL_LOOP
call :CHECK_API_HEALTH
call :CHECK_WEB_HEALTH
if defined API_READY if defined WEB_READY (
    echo Services ready in %Q_WAIT%s!
    goto Q_READY
)
set /a Q_WAIT+=1
if %Q_WAIT% geq 15 goto Q_READY
ping -n 2 127.0.0.1 >nul
goto Q_POLL_LOOP

:Q_READY
echo.
echo  Quick restart complete!
echo  Web: http://localhost:3000  API: http://localhost:3001
echo.
echo  Press Ctrl+C to stop all services.
echo.
goto FOREVER

:INSTALL_GPU
echo.
echo ========================================
echo  Installing GPU Support (PyTorch CUDA)
echo ========================================
echo.

REM Check for NVIDIA GPU
nvidia-smi >nul 2>&1
if !errorlevel! neq 0 (
    echo [X] No NVIDIA GPU detected!
    echo     GPU support requires an NVIDIA GPU with CUDA capability.
    echo.
    pause
    goto MENU
)

echo [OK] NVIDIA GPU detected:
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
echo.

cd /d "%~dp0apps\inference"

REM Validate existing venv
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "print('ok')" >nul 2>&1
    if errorlevel 1 (
        echo Venv Python is broken. Recreating...
        rmdir /s /q ".venv" >nul 2>&1
    )
)
REM Create venv if needed
if not exist ".venv\Scripts\activate.bat" (
    echo Creating Python virtual environment...
    uv venv .venv >nul 2>&1
    if errorlevel 1 python -m venv .venv >nul 2>&1
)

REM Check current PyTorch status
echo Current PyTorch status:
.venv\Scripts\python.exe -c "import torch; print(f'  Version: {torch.__version__}'); print(f'  CUDA available: {torch.cuda.is_available()}')" 2>nul
if errorlevel 1 echo   PyTorch not installed
echo.

echo Uninstalling existing PyTorch...
uv pip uninstall torch torchvision torchaudio --python .venv\Scripts\python.exe >nul 2>&1

echo Installing PyTorch with CUDA 12.8 support (required for RTX 50-series Blackwell)...
echo This will download approximately 2.5GB. Please wait...
echo.
REM Use --torch-backend=cu128 for reliable CUDA wheel resolution
uv pip install torch torchvision torchaudio --torch-backend=cu128 --python .venv\Scripts\python.exe
if !errorlevel! neq 0 (
    echo.
    echo --torch-backend failed, trying --index-url fallback...
    uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 --python .venv\Scripts\python.exe
    if !errorlevel! neq 0 (
        echo CUDA 12.8 failed, trying CUDA 12.6...
        uv pip install torch torchvision torchaudio --torch-backend=cu126 --python .venv\Scripts\python.exe
    )
)

echo.
echo Verifying installation...
.venv\Scripts\python.exe -c "import torch; print(f'PyTorch version: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA arch list: {torch.cuda.get_arch_list()}'); print(f'CUDA device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"

echo.
echo Installing SAM3 dependencies for Windows...
uv pip install triton-windows einops decord --python .venv\Scripts\python.exe >nul 2>&1
echo Installing SAM3 from GitHub ^(PyPI package has broken imports^)...
uv pip install --upgrade --no-deps "sam3 @ git+https://github.com/facebookresearch/sam3.git@c97c893969003d3e6803fd5d679f21e515aef5ce" --python .venv\Scripts\python.exe

echo.
echo GPU support installation complete!
echo Restart the inference service to use GPU acceleration.
echo.
cd /d "%~dp0"
pause
goto MENU

:INSTALL_FFMPEG
echo.
echo ========================================
echo  Installing FFmpeg (for video slicing)
echo ========================================
echo.

REM Check if FFmpeg is already installed
where ffmpeg >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] FFmpeg is already installed!
    ffmpeg -version 2>&1 | findstr "ffmpeg version"
    echo.
    pause
    goto MENU
)

echo FFmpeg is not installed. Attempting automatic installation...
echo.

REM Try winget first (Windows 10/11 built-in package manager)
echo [1/3] Trying winget (Windows Package Manager)...
winget --version >nul 2>&1
if !errorlevel! equ 0 (
    echo      Running: winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    if !errorlevel! equ 0 (
        echo.
        echo [OK] FFmpeg installed successfully via winget!
        echo.
        echo IMPORTANT: You may need to restart your terminal or run.bat
        echo            for FFmpeg to be available in PATH.
        echo.
        pause
        goto MENU
    )
    echo      winget installation failed or was cancelled.
)

REM Try chocolatey
echo.
echo [2/3] Trying Chocolatey...
choco --version >nul 2>&1
if !errorlevel! equ 0 (
    echo      Running: choco install ffmpeg -y
    choco install ffmpeg -y
    if !errorlevel! equ 0 (
        echo.
        echo [OK] FFmpeg installed successfully via Chocolatey!
        echo.
        echo IMPORTANT: You may need to restart your terminal or run.bat
        echo            for FFmpeg to be available in PATH.
        echo.
        pause
        goto MENU
    )
    echo      Chocolatey installation failed.
) else (
    echo      Chocolatey not installed.
)

REM Manual installation instructions
echo.
echo [3/3] Automatic installation failed.
echo.
echo ========================================
echo  Manual FFmpeg Installation Instructions
echo ========================================
echo.
echo Option A: Using winget (Recommended for Windows 10/11)
echo   1. Open PowerShell as Administrator
echo   2. Run: winget install Gyan.FFmpeg
echo.
echo Option B: Using Chocolatey
echo   1. Install Chocolatey: https://chocolatey.org/install
echo   2. Run: choco install ffmpeg
echo.
echo Option C: Manual Download
echo   1. Go to: https://github.com/BtbN/FFmpeg-Builds/releases
echo   2. Download: ffmpeg-master-latest-win64-gpl.zip
echo   3. Extract to C:\ffmpeg
echo   4. Add C:\ffmpeg\bin to your system PATH
echo.
echo After installation, restart run.bat and select option [1].
echo.
pause
goto MENU

:STOP_ALL
echo.
echo Stopping all services...
echo.

REM Kill application processes first
echo Stopping application processes...
taskkill /F /IM bun.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq *uvicorn*" >nul 2>&1

REM Stop Docker services
echo Stopping infrastructure...
cd /d "%~dp0infra"
%DOCKER_COMPOSE_CMD% down

echo.
echo All services stopped.
cd /d "%~dp0"
pause
goto MENU

:VIEW_LOGS
echo.
echo Select logs to view:
echo  [1] Docker container logs
echo  [2] Return to menu
echo.
set /p logchoice="Enter choice: "

if "%logchoice%"=="1" (
    cd /d "%~dp0infra"
    %DOCKER_COMPOSE_CMD% logs --tail=100
    pause
)
cd /d "%~dp0"
goto MENU

:EXIT
echo.
echo Goodbye!
echo.
goto END

:ERROR_HANDLER
echo.
echo ========================================
echo  [ERROR] An error occurred during startup
echo ========================================
echo.
echo The script encountered an error. Please review the messages above.
echo Common fixes:
echo   1. Make sure Docker Desktop is running
echo   2. Run option [7] to install/update dependencies
echo   3. Check if ports 3000, 3001, 5433, 6380 are available
echo.
echo Press any key to return to the menu...
pause >nul
goto MENU

:END
endlocal
echo.
echo Press any key to close this window...
pause >nul
exit /b 0

REM Safety net - if script somehow reaches here, prevent auto-close
:UNEXPECTED_END
echo.
echo [ERROR] Script ended unexpectedly. Press any key to close...
pause >nul
exit /b 1
