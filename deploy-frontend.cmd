@echo off
set HOST=root@93.125.82.173
set PAGES=/opt/educa/student/src/pages

scp student/src/pages/Practice.js student/src/pages/Statistics.js student/src/pages/Statistics.css student/src/pages/DataContext.js student/src/pages/StudentApp.js student/src/pages/AdminPanel.js %HOST%:%PAGES%/
scp student/src/components/admin/Cleanup.js student/src/components/admin/Homework.js %HOST%:/opt/educa/student/src/components/admin/
scp student/src/styles/Cleanup.css %HOST%:/opt/educa/student/src/styles/
scp student/package.json student/package-lock.json %HOST%:/opt/educa/student/

ssh %HOST% "cd /opt/educa && docker compose up -d --build frontend"

echo Frontend deployed.
