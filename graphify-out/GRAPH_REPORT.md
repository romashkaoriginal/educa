# Graph Report - .  (2026-06-16)

## Corpus Check
- 119 files · ~265,275 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 834 nodes · 1513 edges · 77 communities (52 shown, 25 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Admin API Layer|Admin API Layer]]
- [[_COMMUNITY_Stats Cleanup Pipeline|Stats Cleanup Pipeline]]
- [[_COMMUNITY_Core App Concepts|Core App Concepts]]
- [[_COMMUNITY_Admin Stats Controllers|Admin Stats Controllers]]
- [[_COMMUNITY_Practice Controllers|Practice Controllers]]
- [[_COMMUNITY_Express App Wiring|Express App Wiring]]
- [[_COMMUNITY_Backend Package Config|Backend Package Config]]
- [[_COMMUNITY_Frontend Package Config|Frontend Package Config]]
- [[_COMMUNITY_Telegram Bot|Telegram Bot]]
- [[_COMMUNITY_Practice Dashboard Service|Practice Dashboard Service]]
- [[_COMMUNITY_Homework Data Models|Homework Data Models]]
- [[_COMMUNITY_Practice Frontend|Practice Frontend]]
- [[_COMMUNITY_Statistics Frontend|Statistics Frontend]]
- [[_COMMUNITY_User & Subject Core|User & Subject Core]]
- [[_COMMUNITY_Score & Streak Logic|Score & Streak Logic]]
- [[_COMMUNITY_Student Management|Student Management]]
- [[_COMMUNITY_Database Config|Database Config]]
- [[_COMMUNITY_Homework Models|Homework Models]]
- [[_COMMUNITY_Adaptive Practice UI|Adaptive Practice UI]]
- [[_COMMUNITY_Predicted Score System|Predicted Score System]]
- [[_COMMUNITY_Module 20|Module 20]]
- [[_COMMUNITY_Module 21|Module 21]]
- [[_COMMUNITY_Module 22|Module 22]]
- [[_COMMUNITY_Module 23|Module 23]]
- [[_COMMUNITY_Module 24|Module 24]]
- [[_COMMUNITY_Module 25|Module 25]]
- [[_COMMUNITY_Module 26|Module 26]]
- [[_COMMUNITY_Module 27|Module 27]]
- [[_COMMUNITY_Module 28|Module 28]]
- [[_COMMUNITY_Module 29|Module 29]]
- [[_COMMUNITY_Module 30|Module 30]]
- [[_COMMUNITY_Module 31|Module 31]]
- [[_COMMUNITY_Module 32|Module 32]]
- [[_COMMUNITY_Module 33|Module 33]]
- [[_COMMUNITY_Module 34|Module 34]]
- [[_COMMUNITY_Module 35|Module 35]]
- [[_COMMUNITY_Module 36|Module 36]]
- [[_COMMUNITY_Module 37|Module 37]]
- [[_COMMUNITY_Module 38|Module 38]]
- [[_COMMUNITY_Module 39|Module 39]]
- [[_COMMUNITY_Module 40|Module 40]]
- [[_COMMUNITY_Module 41|Module 41]]
- [[_COMMUNITY_Module 42|Module 42]]
- [[_COMMUNITY_Module 43|Module 43]]
- [[_COMMUNITY_Module 44|Module 44]]
- [[_COMMUNITY_Module 45|Module 45]]
- [[_COMMUNITY_Module 46|Module 46]]
- [[_COMMUNITY_Module 47|Module 47]]
- [[_COMMUNITY_Module 48|Module 48]]
- [[_COMMUNITY_Module 49|Module 49]]
- [[_COMMUNITY_Module 50|Module 50]]
- [[_COMMUNITY_Module 51|Module 51]]
- [[_COMMUNITY_Module 52|Module 52]]
- [[_COMMUNITY_Module 53|Module 53]]
- [[_COMMUNITY_Module 54|Module 54]]
- [[_COMMUNITY_Module 55|Module 55]]
- [[_COMMUNITY_Module 56|Module 56]]
- [[_COMMUNITY_Module 57|Module 57]]
- [[_COMMUNITY_Module 58|Module 58]]
- [[_COMMUNITY_Module 59|Module 59]]
- [[_COMMUNITY_Module 60|Module 60]]
- [[_COMMUNITY_Module 61|Module 61]]
- [[_COMMUNITY_Module 62|Module 62]]
- [[_COMMUNITY_Module 63|Module 63]]
- [[_COMMUNITY_Module 64|Module 64]]
- [[_COMMUNITY_Module 65|Module 65]]
- [[_COMMUNITY_Module 66|Module 66]]
- [[_COMMUNITY_Module 67|Module 67]]
- [[_COMMUNITY_Module 68|Module 68]]
- [[_COMMUNITY_Module 69|Module 69]]
- [[_COMMUNITY_Module 70|Module 70]]
- [[_COMMUNITY_Module 71|Module 71]]
- [[_COMMUNITY_Module 72|Module 72]]
- [[_COMMUNITY_Module 73|Module 73]]
- [[_COMMUNITY_Module 74|Module 74]]
- [[_COMMUNITY_Module 75|Module 75]]
- [[_COMMUNITY_Module 76|Module 76]]

## God Nodes (most connected - your core abstractions)
1. `adminFetch()` - 33 edges
2. `useSectionRefresh()` - 26 edges
3. `User` - 18 edges
4. `buildSubjectDashboard()` - 18 edges
5. `Subject` - 16 edges
6. `Subject` - 14 edges
7. `User` - 14 edges
8. `apiFetch()` - 14 edges
9. `useConfirmDelete()` - 12 edges
10. `AdminPanelContent()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Telegram InitData HMAC Verification` --conceptually_related_to--> `Telegram Web App Integration`  [INFERRED]
  back/src/middleware/telegramAuth.js → student/public/index.html
- `Telegram Bot Module` --references--> `Telegram Web App Integration`  [EXTRACTED]
  back/src/bot.js → student/public/index.html
- `Cleanup Admin Component` --references--> `Practice Stats Aggregate Service`  [INFERRED]
  student/src/components/admin/Cleanup.js → back/src/services/practiceStatsAggregate.js
- `PredictedScoreCard Component` --shares_data_with--> `Predicted Score Service`  [INFERRED]
  student/src/components/PredictedScoreCard.js → back/src/services/predictedScore.js
- `BotTest` --semantically_similar_to--> `PracticeQuestion`  [INFERRED] [semantically similar]
  back/src/models/BotTest.js → back/src/models/PracticeQuestion.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Telegram Auth Middleware Chain (telegramAuth + requireUser/requireAdmin/requireRole)** — middleware_telegramauth_telegramauth, middleware_telegramauth_requireuser, middleware_telegramauth_requireadmin, middleware_telegramauth_requirerole, concept_rbac [EXTRACTED 1.00]
- **Practice Score Calculation Pipeline** — controllers_practicecontroller_buildprediction, concept_predicted_score, controllers_practicecontroller_saveattempt, controllers_practicecontroller_saveanswer, controllers_practicecontroller_sessionsummary, controllers_practicecontroller_getpredicted [EXTRACTED 1.00]
- **BotUser to System User Sync** — controllers_botusercontroller_sync, controllers_botusercontroller_register, controllers_usercontroller_create, controllers_studentcontroller_create, concept_botuser_assignment [EXTRACTED 1.00]

## Communities (77 total, 25 thin omitted)

### Community 0 - "Admin API Layer"
Cohesion: 0.11
Nodes (44): adminFetch(), getInitData(), AdminDataContext, AdminDataProvider(), useAdminData(), Applications(), CRM_LABELS, STATUS_LABELS (+36 more)

### Community 1 - "Stats Cleanup Pipeline"
Cohesion: 0.06
Nodes (53): {
  clearAggregatesForScope,
  migratePracticeStatsFromAttempts,
  rebuildPracticeStatsFromResults
}, clearStudentAnswersBySubject(), migratePracticeStats(), { Op }, {
  PracticeAttempt,
  PracticeQuestionResult,
  PracticeBest,
  PracticeScoreHistory,
  PracticeDailyLog,
  PracticeTopic,
  User,
  Subject
}, rebuildPracticeStats(), PracticeAttempt, PracticeBest (+45 more)

### Community 2 - "Core App Concepts"
Cohesion: 0.06
Nodes (47): AmoCRM Integration for Applications, Bot Secret Header Authentication, Quiz Lifecycle (draft→active→finished), Real-time Quiz Session via Socket.IO, Telegram WebApp initData Authentication, User Roles (admin/teacher/manager/student), Sequelize Model Associations & Exports, { DataTypes } (+39 more)

### Community 3 - "Admin Stats Controllers"
Cohesion: 0.06
Nodes (24): getHomeworkStats(), getPracticeStats(), getQuizStats(), Get Student Stats, getStudentStats(), { Op }, { 
  PracticeBest,
  PracticeDailyLog,
  PracticeTopic, 
  PracticeQuestion,
  Subject, 
  User,
  HomeworkSubmission,
  Homework,
  QuizParticipant,
  Quiz
}, sequelize (+16 more)

### Community 4 - "Practice Controllers"
Cohesion: 0.07
Nodes (17): In-Memory Stats Cache (60s TTL), buildDailyGoalEntry(), { buildSubjectDashboard }, { calculateHomeworkScore }, { calculatePredictedScore, getGrowthTopicIds, CONFIG }, countCorrectFromDailyStats(), countCorrectTotalInRange(), countCorrectUniqueInRange() (+9 more)

### Community 5 - "Express App Wiring"
Cohesion: 0.06
Nodes (32): app, syncDatabase(), adminRoutes, allowedOrigins, apiLimiter, applicationRoutes, authLimiter, authRoutes (+24 more)

### Community 6 - "Backend Package Config"
Cohesion: 0.06
Nodes (30): author, dependencies, axios, bcryptjs, compression, cors, dotenv, exceljs (+22 more)

### Community 7 - "Frontend Package Config"
Cohesion: 0.07
Nodes (27): browserslist, development, production, dependencies, react, react-dom, react-scripts, socket.io-client (+19 more)

### Community 8 - "Telegram Bot"
Cohesion: 0.12
Nodes (19): applicationSessions, axios, checkAndIncrement(), checkLimit(), getSubjects(), getTestQuestions(), lastTestResults, { refreshWebAppUrl, getWebAppUrlSync } (+11 more)

### Community 9 - "Practice Dashboard Service"
Cohesion: 0.16
Nodes (18): getSubjectDashboard(), buildAchievements(), { buildRecentErrorPayload }, buildRecommendation(), buildSubjectDashboard(), { calculateHomeworkScore }, computeBestStreakFromDates(), computeTodayDelta() (+10 more)

### Community 10 - "Homework Data Models"
Cohesion: 0.14
Nodes (15): Homework, HomeworkAnswer, HomeworkQuestion, HomeworkSubmission, sequelize, express, { Homework, HomeworkQuestion, HomeworkSubmission, HomeworkAnswer, User, Subject, sequelize }, isAdmin (+7 more)

### Community 11 - "Practice Frontend"
Cohesion: 0.24
Nodes (14): computeAdaptiveLevel(), filterByTier(), getCalibrationTier(), getTrailingStreak(), levelToTier(), pickAdaptiveFromPool(), pickCalibrationFromPool(), pickFromPool() (+6 more)

### Community 12 - "Statistics Frontend"
Cohesion: 0.13
Nodes (10): countHomeworkSubjects(), DIFF_LABELS, DIFF_TARGETS, DIFF_WEIGHTS, DIFF_WORD, pluralAnswers(), pluralPoints(), pluralRu() (+2 more)

### Community 13 - "User & Subject Core"
Cohesion: 0.29
Nodes (16): Subject (referenced table), User (referenced table), BotUser, { DataTypes }, sequelize, PracticeAttempt, PracticeBest, PracticeDifficultyTotals (+8 more)

### Community 14 - "Score & Streak Logic"
Cohesion: 0.18
Nodes (17): buildPrediction(), buildStreakForStudent(), getDailyGoalCompletionDates(), Get Predicted Score, getPredictedScore(), getStreak(), invalidateCache(), persistPracticeAnswer Helper (+9 more)

### Community 15 - "Student Management"
Cohesion: 0.16
Nodes (10): buildSubjectsText(), Create Student, createStudent(), { getWebAppUrlSync }, notifyStudent(), { Op }, Update Student, updateStudent() (+2 more)

### Community 16 - "Database Config"
Cohesion: 0.12
Nodes (10): { Sequelize }, { DataTypes }, NotificationLog, sequelize, { DataTypes }, sequelize, { DataTypes }, sequelize (+2 more)

### Community 17 - "Homework Models"
Cohesion: 0.13
Nodes (12): { DataTypes }, Homework, sequelize, { DataTypes }, HomeworkAnswer, sequelize, { DataTypes }, HomeworkQuestion (+4 more)

### Community 18 - "Adaptive Practice UI"
Cohesion: 0.26
Nodes (11): Adaptive Practice Difficulty Algorithm, Client-Side Data Caching via DataContext, Optimistic UI Updates Pattern, DataContext, DataProvider(), useData(), StudentHomework(), Practice() (+3 more)

### Community 19 - "Predicted Score System"
Cohesion: 0.21
Nodes (12): Daily Practice Goal (50 questions), Predicted CT Score Algorithm, calcDifficultyMastery(), calcTopicProgress(), calculatePredictedScore(), CONFIG, DIFFICULTIES, getDifficultyBreakdown() (+4 more)

### Community 20 - "Module 20"
Cohesion: 0.18
Nodes (11): Express App Entry Point, Telegram Bot Module, Application CRM Status Workflow, Daily Limit Pattern (bot tests and applications), Railway Keep-Alive Self-Ping, API Rate Limiting Strategy, Telegram Web App Integration, Application (+3 more)

### Community 21 - "Module 21"
Cohesion: 0.17
Nodes (4): { User }, express, router, userController

### Community 22 - "Module 22"
Cohesion: 0.27
Nodes (9): AdminPanel(), apiFetch(), getInitData(), Telegram initData Auth Header, StudentApp(), Telegram Auth Resolution Flow, App(), Vercel CORS and CSP Configuration (+1 more)

### Community 23 - "Module 23"
Cohesion: 0.25
Nodes (6): formatQuizLine(), formatScore(), Quiz(), ScoreChip(), useCountUp(), SOCKET_URL

### Community 24 - "Module 24"
Cohesion: 0.24
Nodes (4): StudentBrandMark(), getDeadlineHint(), getHomeworkCardState(), HOMEWORK_SUBJECT_CARD_BACKGROUNDS

### Community 25 - "Module 25"
Cohesion: 0.33
Nodes (10): Aggregate Stats Migration Pattern, Homework Score Formula (kDone * 0.4 + kCorrect * 0.6) * 20, Predicted Score Formula (Practice 80 + Homework 20), Homework Score Service, Practice Dashboard Service, Practice Stats Aggregate Service, Predicted Score Service, Cleanup Admin Component (+2 more)

### Community 26 - "Module 26"
Cohesion: 0.24
Nodes (9): Role-Based Access Control (admin/teacher/manager/student), Telegram InitData HMAC Verification, crypto, requireAdmin(), requireRole(), requireUser(), telegramAuth(), { User } (+1 more)

### Community 27 - "Module 27"
Cohesion: 0.20
Nodes (5): { BotUser, User }, Get All Bot Users, { Op }, Get Bot Users Stats, BotUser

### Community 28 - "Module 28"
Cohesion: 0.22
Nodes (8): Application, { Application, Subject }, canManage, express, router, { sendToAmoCRM }, { telegramAuth, requireRole }, sendToAmoCRM()

### Community 29 - "Module 29"
Cohesion: 0.33
Nodes (9): computeStreakFromDates(), formatLogDate(), getDailyGoal(), getLeaderboard(), getLocalDateStr(), getLocalDayBounds(), getPeriodBounds(), getPeriodStart() (+1 more)

### Community 30 - "Module 30"
Cohesion: 0.22
Nodes (5): { User, Subject }, User, express, router, subjectController

### Community 31 - "Module 31"
Cohesion: 0.25
Nodes (7): requireSuperAdmin(), Subject, cleanupController, express, { requireSuperAdmin }, router, { User, Subject }

### Community 32 - "Module 32"
Cohesion: 0.36
Nodes (8): English Language Subject Banner, English Language Homework Banner, Mathematics Homework Banner, Physics Homework Banner, Russian Language Homework Banner, Mathematics Subject Banner, Physics Subject Banner, Russian Language Subject Banner

### Community 33 - "Module 33"
Cohesion: 0.25
Nodes (4): bcrypt, jwt, { User }, { validationResult }

### Community 34 - "Module 34"
Cohesion: 0.25
Nodes (6): NotificationLog, express, { getBot }, { Op }, router, { User, Subject, UserSubject, HomeworkSubmission, Homework, NotificationLog }

### Community 35 - "Module 35"
Cohesion: 0.25
Nodes (6): { DataTypes }, PracticeDailyLog, sequelize, { DataTypes }, PracticeDailyStats, sequelize

### Community 36 - "Module 36"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 37 - "Module 37"
Cohesion: 0.52
Nodes (6): estimateTasksToMilestone(), getNextScoreMilestone(), getPredictedEncouragement(), getScoreMilestoneHint(), getScoreMilestoneHint Function, Score Milestone Progression Concept

### Community 38 - "Module 38"
Cohesion: 0.60
Nodes (5): estimateTasksToMilestone(), getNextScoreMilestone(), getPredictedEncouragement(), getScoreMilestoneHint(), PredictedScoreCard()

### Community 39 - "Module 39"
Cohesion: 0.33
Nodes (6): BotUser to SystemUser Assignment Pattern, Register Or Update Bot User, Sync Assigned Status, Delete Student, Create User, Delete User

### Community 40 - "Module 40"
Cohesion: 0.33
Nodes (5): BotTest, { BotTest, Subject }, express, { requireRole }, router

### Community 41 - "Module 41"
Cohesion: 0.33
Nodes (5): UserSubject, authController, { body }, express, router

### Community 42 - "Module 42"
Cohesion: 0.33
Nodes (5): getAppOpenButton(), getAppOpenKeyboard(), isHttpsWebAppUrl(), axios, getWebAppUrlSync()

### Community 43 - "Module 43"
Cohesion: 0.40
Nodes (3): botUserController, express, router

### Community 44 - "Module 44"
Cohesion: 0.83
Nodes (4): Kubik Icon (Open Book), Kubik Logo (Standard / White Background), Kubik Logo (Dark / Text Only), Kubik Logo (Transparent Background)

### Community 45 - "Module 45"
Cohesion: 0.50
Nodes (4): Practice Stats Aggregation Service, Clear Student Answers By Subject, Migrate Practice Stats, Rebuild Practice Stats

### Community 47 - "Module 47"
Cohesion: 0.50
Nodes (3): BotTest, { DataTypes }, sequelize

### Community 48 - "Module 48"
Cohesion: 0.50
Nodes (3): express, router, studentController

### Community 49 - "Module 49"
Cohesion: 0.50
Nodes (3): fs, path, target

### Community 50 - "Module 50"
Cohesion: 0.67
Nodes (3): Excel Question Import via ExcelJS, Get Questions Import Template, Import Questions From Excel

### Community 59 - "Module 59"
Cohesion: 1.00
Nodes (3): React Logo 192px (App Icon), React Logo 512px (App Icon), React Logo SVG (Source)

### Community 61 - "Module 61"
Cohesion: 0.67
Nodes (3): Frontend Version Manifest, Write Version Build Script, Web App URL Utility

## Ambiguous Edges - Review These
- `BotUsers Route Handler` → `Telegram WebApp initData Authentication`  [AMBIGUOUS]
  back/src/routes/botUsers.js · relation: conceptually_related_to

## Knowledge Gaps
- **332 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+327 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BotUsers Route Handler` and `Telegram WebApp initData Authentication`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `User` connect `Module 30` to `Module 33`, `Stats Cleanup Pipeline`, `Admin Stats Controllers`, `Practice Controllers`, `Module 34`, `Telegram Bot`, `Module 41`, `Homework Data Models`, `Student Management`, `Module 21`, `Module 26`, `Module 27`, `Module 31`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `Subject` connect `Module 31` to `Stats Cleanup Pipeline`, `Module 34`, `Admin Stats Controllers`, `Practice Controllers`, `Module 40`, `Module 41`, `Homework Data Models`, `Practice Dashboard Service`, `Telegram Bot`, `Student Management`, `Module 28`, `Module 30`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `buildSubjectDashboard()` (e.g. with `buildStreakForStudent()` and `getDailyGoalCompletionDates()`) actually correct?**
  _`buildSubjectDashboard()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _334 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin API Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.10547875064004096 - nodes in this community are weakly interconnected._
- **Should `Stats Cleanup Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.062146892655367235 - nodes in this community are weakly interconnected._