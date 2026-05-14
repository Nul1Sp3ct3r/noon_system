@echo off
echo Installing requirements...
pip install -r requirements.txt
pip install pyinstaller
echo Building EXE...
pyinstaller --onefile --windowed ^
  --add-data "templates;templates" ^
  --add-data "static;static" ^
  --name "NoonFinancial" ^
  app.py
echo.
echo Done! File is at dist\NoonFinancial.exe
pause
