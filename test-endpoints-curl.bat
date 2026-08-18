@echo off
REM Test the endpoints directly

echo Waiting for dev server to be ready...
timeout /t 3 /nobreak

echo.
echo Testing endpoints...
echo.

echo GET /api/admin/menu-items
curl -s http://localhost:3000/api/admin/menu-items | find "error" || echo OK
echo.

echo GET /api/admin/menu-categories
curl -s http://localhost:3000/api/admin/menu-categories | find "error" || echo OK
echo.

echo GET /api/admin/hero-slides
curl -s http://localhost:3000/api/admin/hero-slides | find "error" || echo OK
echo.

echo GET /api/admin/website-pages
curl -s http://localhost:3000/api/admin/website-pages | find "error" || echo OK
echo.
