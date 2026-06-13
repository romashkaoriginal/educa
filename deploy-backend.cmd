@echo off
set HOST=root@93.125.82.173
set BASE=/opt/educa/back

scp back/src/controllers/practiceController.js %HOST%:%BASE%/src/controllers/
scp back/src/routes/practice.js %HOST%:%BASE%/src/routes/
scp back/src/services/practiceDashboard.js %HOST%:%BASE%/src/services/
scp back/src/controllers/cleanupController.js %HOST%:%BASE%/src/controllers/
scp back/src/middleware/superAdmin.js %HOST%:%BASE%/src/middleware/
scp back/src/routes/admin.js %HOST%:%BASE%/src/routes/
scp back/src/models/PracticeAttempt.js %HOST%:%BASE%/src/models/

ssh %HOST% "cd /opt/educa && docker compose up -d --build backend"

echo Backend deployed.
